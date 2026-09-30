// Estado central do editor: projeto aberto, alterações, desfazer/refazer e salvamento automático.
const api = window.sneslador;

class Store extends EventTarget {
  constructor() {
    super();
    this.dir = null;
    this.project = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.saveTimer = null;
    this.lastSnapshot = null;
  }

  async load(dir) {
    this.dir = dir;
    this.project = await api.loadProject(dir);
    this.lastSnapshot = JSON.stringify(this.project);
    this.emit('load');
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }

  /**
   * Aplica uma alteração. `fn` recebe o projeto e o modifica.
   * kind: 'sprite' | 'tileset' | 'scene' | 'script' | 'palette' | 'sound' | 'music' | 'project'
   */
  change(kind, fn, { id = null, undoable = true, coalesce = null } = {}) {
    const before = this.lastSnapshot;
    fn(this.project);
    const after = JSON.stringify(this.project);
    if (after === before) return;
    if (undoable) {
      const top = this.undoStack[this.undoStack.length - 1];
      if (coalesce && top && top.coalesce === coalesce && Date.now() - top.time < 1200) {
        top.time = Date.now();
      } else {
        this.undoStack.push({ snapshot: before, kind, id, coalesce, time: Date.now() });
        if (this.undoStack.length > 200) this.undoStack.shift();
      }
      this.redoStack = [];
    }
    this.lastSnapshot = after;
    this.markDirty();
    this.emit('change', { kind, id });
  }

  undo() { this.travel(this.undoStack, this.redoStack); }
  redo() { this.travel(this.redoStack, this.undoStack); }

  travel(from, to) {
    const step = from.pop();
    if (!step) return;
    to.push({ ...step, snapshot: this.lastSnapshot });
    this.project = JSON.parse(step.snapshot);
    this.lastSnapshot = step.snapshot;
    this.markDirty();
    this.emit('change', { kind: 'all' });
  }

  markDirty() {
    this.dirty = true;
    this.emit('dirty', { dirty: true });
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 1200);
  }

  async save() {
    clearTimeout(this.saveTimer);
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await api.saveProject(this.dir, this.project);
      this.emit('dirty', { dirty: false, saved: true });
    } catch (e) {
      this.dirty = true;
      this.emit('dirty', { dirty: true, error: e.message });
    }
  }

  // helpers de busca
  sprite(id) { return this.project.sprites.find((s) => s.id === id); }
  tileset(id) { return this.project.tilesets.find((s) => s.id === id); }
  scene(id) { return this.project.scenes.find((s) => s.id === id); }
  sound(id) { return this.project.sounds.find((s) => s.id === id); }
  song(id) { return (this.project.songs ?? []).find((s) => s.id === id); }
}

export const store = new Store();
