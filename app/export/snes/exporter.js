// Exportador SNES: projeto -> pasta de build (C + asm + binários) -> ROM .sfc usando PVSnesLib.
// Roda no processo principal (Node). Chama as ferramentas do toolchain diretamente, sem make.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildGameData } from '../../core/gamedata.js';
import { compileGame } from '../../core/lang/compiler.js';
import { assetConstants } from '../../core/project.js';
import { parseWav, resample } from '../../core/audio/wav.js';
import { effectsModule, songModule } from '../../core/audio/itwriter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.join(HERE, 'runtime');

export function toolchainPaths(home) {
  return {
    home,
    tcc: path.join(home, 'devkitsnes', 'bin', '816-tcc.exe'),
    wla: path.join(home, 'devkitsnes', 'bin', 'wla-65816.exe'),
    link: path.join(home, 'devkitsnes', 'bin', 'wlalink.exe'),
    opt: path.join(home, 'devkitsnes', 'tools', '816-opt.exe'),
    brr: path.join(home, 'devkitsnes', 'tools', 'snesbrr.exe'),
    smconv: path.join(home, 'devkitsnes', 'tools', 'smconv.exe'),
    hdr: path.join(home, 'devkitsnes', 'include', 'hdr.asm.in'),
    inc1: path.join(home, 'pvsneslib', 'include'),
    inc2: path.join(home, 'devkitsnes', 'include'),
    lib: path.join(home, 'pvsneslib', 'lib', 'LoROM_SlowROM'),
  };
}

export function toolchainOk(home) {
  if (!home) return false;
  const t = toolchainPaths(home);
  return [t.tcc, t.wla, t.link, t.opt, t.smconv].every((f) => fs.existsSync(f));
}

function run(exe, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd, windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      // eslint-disable-next-line no-control-regex
      const clean = out.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (clean) log(clean);
      if (code === 0) resolve(clean);
      else reject(new Error(`${path.basename(exe)} falhou (código ${code})\n${clean}`));
    });
  });
}

const cArray = (type, name, values) => `const ${type} ${name}[${Math.max(1, values.length)}] = {${values.length ? values.join(',') : '0'}};`;

/**
 * Gera todos os arquivos da build. Não precisa do toolchain (útil para testes).
 * @returns {{data, compiled, files: Record<string, Buffer|string>}}
 */
export function generateBuildFiles(project, { readAsset, compiledMusic } = {}) {
  const data = buildGameData(project);
  const compiled = compileGame({
    global: { src: project.globalScript },
    scenes: project.scenes.map((s) => ({ name: s.name, src: s.script })),
    assetConsts: assetConstants(project),
  });
  if (!compiled.ok) {
    const err = new Error('Erros nos scripts');
    err.scriptErrors = compiled.errors;
    throw err;
  }

  const files = {};
  const asm = ['.include "hdr.asm"', ''];
  const section = (name, body) => { asm.push(`.section ".${name}" superfree`, ...body, '.ends', ''); };

  // paletas (CGRAM inteira: 256 cores x 2 bytes)
  const pal = Buffer.alloc(512);
  data.cgram.forEach((c, i) => pal.writeUInt16LE(c, i * 2));
  files['palettes.bin'] = pal;
  files['font.pic'] = Buffer.from(data.fontTiles);
  files['obj.pic'] = Buffer.from(data.objTiles);
  section('sl_sys', ['sl_palettes:', '.incbin "palettes.bin"', 'sl_font:', '.incbin "font.pic"', 'sl_font_end:']);
  section('sl_obj', ['sl_objtiles:', '.incbin "obj.pic"', 'sl_objtiles_end:']);

  // cenas
  const loadCases = [];
  data.scenes.forEach((s, i) => {
    const p = `scn${i}`;
    files[`${p}_tiles.pic`] = Buffer.from(s.bgTiles);
    section(`${p}_t`, [`${p}_tiles:`, `.incbin "${p}_tiles.pic"`]);
    const u16buf = (arr) => { const b = Buffer.alloc(arr.length * 2); arr.forEach((v, k) => b.writeUInt16LE(v & 0xffff, k * 2)); return b; };
    const map1 = s.bg1 ? s.bg1.map : new Uint16Array(1024);
    files[`${p}_map1.map`] = u16buf(map1);
    const tables = [`${p}_map1:`, `.incbin "${p}_map1.map"`];
    if (s.bg2) {
      files[`${p}_map2.map`] = u16buf(s.bg2.map);
      tables.push(`${p}_map2:`, `.incbin "${p}_map2.map"`);
    }
    files[`${p}_tcell.bin`] = u16buf(s.tileCell);
    files[`${p}_tflag.bin`] = Buffer.from(s.tileFlags);
    tables.push(`${p}_tcell:`, `.incbin "${p}_tcell.bin"`, `${p}_tflag:`, `.incbin "${p}_tflag.bin"`);
    if (s.cellTile.length) {
      files[`${p}_ctile.bin`] = u16buf(s.cellTile);
      tables.push(`${p}_ctile:`, `.incbin "${p}_ctile.bin"`);
    }
    section(`${p}_m`, tables);
    loadCases.push([
      `\tcase ${i}:`,
      `\t\tsl_ld_tiles = (u8 *)&${p}_tiles; sl_ld_tiles_size = ${s.bgTiles.length};`,
      `\t\tsl_ld_map1 = (u8 *)&${p}_map1; sl_ld_map1_w = ${s.bg1 ? s.bg1.w : 32};`,
      s.bg2 ? `\t\tsl_ld_map2 = (u8 *)&${p}_map2;` : '\t\tsl_ld_map2 = 0;',
      `\t\tsl_ld_tilecell = (u8 *)&${p}_tcell; sl_ld_tileflags = (u8 *)&${p}_tflag; sl_ld_ntiles = ${s.bgTileCount};`,
      s.cellTile.length ? `\t\tsl_ld_celltile = (u8 *)&${p}_ctile; sl_ld_ncells = ${s.cellTile.length};` : '\t\tsl_ld_ncells = 0;',
      `\t\tsl_ld_bgcolor = ${s.bgcolor}; sl_ld_bg1pal = ${s.bg1Palette}; sl_ld_parallax = ${s.parallax | 0};`,
      '\t\tbreak;',
    ].join('\n'));
  });

  // sons e músicas: módulos Impulse Tracker (.it) -> smconv -> soundbank do snesmod
  const rate = [4000, 8000, 12000, 16000].includes(project.soundRate) ? project.soundRate : 8000;
  const sfxPitch = rate / 4000; // spcEffect: 1 = 4 kHz, 2 = 8 kHz, 4 = 16 kHz
  const sfx = project.sounds.map((snd) => {
    const raw = readAsset ? readAsset(snd.file) : null;
    if (!raw) throw new Error(`Não encontrei o arquivo do som "${snd.name}" (${snd.file}).`);
    const { rate: r0, samples } = parseWav(raw);
    const pcm = resample(samples, r0, rate);
    const vol = Math.max(0, Math.min(15, snd.volume ?? 15)) / 15;
    if (vol < 1) for (let k = 0; k < pcm.length; k++) pcm[k] *= vol;
    return { name: snd.name, pcm, rate };
  });
  const songs = project.songs ?? [];
  const hasAudio = sfx.length > 0 || songs.length > 0;
  const audioFiles = [];
  if (hasAudio) {
    files['efeitos.it'] = Buffer.from(effectsModule(sfx.length ? sfx : [{ name: 'silencio', pcm: new Float32Array(32), rate }]));
    audioFiles.push('efeitos.it');
    songs.forEach((song, i) => {
      files[`musica${i}.it`] = Buffer.from(songModule(song));
      audioFiles.push(`musica${i}.it`);
    });
  }

  // tabelas de sprites e animações
  const sprFirst = [], sprCount = [], sprLarge = [], sprPal = [], frameTiles = [];
  data.sprites.forEach((s) => {
    sprFirst.push(frameTiles.length);
    sprCount.push(s.frames.length);
    sprLarge.push(s.large);
    sprPal.push(s.palette);
    frameTiles.push(...s.frames);
  });
  const anFirst = [], anLen = [], anSpeed = [], anLoop = [], anFrames = [];
  data.anims.forEach((a) => {
    anFirst.push(anFrames.length);
    anLen.push(a.frames.length);
    anSpeed.push(a.speed);
    anLoop.push(a.loop ? 1 : 0);
    anFrames.push(...a.frames);
  });

  files['gamedata.h'] = [
    '/* Gerado pelo Sneslador */',
    '#ifndef GAMEDATA_H', '#define GAMEDATA_H',
    `#define SL_SPRITE_COUNT ${data.sprites.length}`,
    `#define SL_ANIM_COUNT ${data.anims.length}`,
    `#define SL_SCENE_COUNT ${data.scenes.length}`,
    `#define SL_SOUND_COUNT ${sfx.length}`,
    `#define SL_SONG_COUNT ${songs.length}`,
    `#define SL_HAS_AUDIO ${hasAudio ? 1 : 0}`,
    `#define SL_SFX_PITCH ${sfxPitch}`,
    `#define SL_START_SCENE ${data.startScene}`,
    `#define SL_OBJSIZE ${data.spriteMode.obsel}`,
    'extern const u16 sl_spr_first[], sl_spr_count[], sl_frame_tile[];',
    'extern const u8 sl_spr_large[], sl_spr_pal[];',
    'extern const u16 sl_anim_first[], sl_anim_len[], sl_anim_speed[], sl_anim_frames[];',
    'extern const u8 sl_anim_loop[];',
    '#endif', '',
  ].join('\n');

  const externs = [];
  data.scenes.forEach((s, i) => {
    const p = `scn${i}`;
    externs.push(`extern char ${p}_tiles, ${p}_map1, ${p}_tcell, ${p}_tflag${s.bg2 ? `, ${p}_map2` : ''}${s.cellTile.length ? `, ${p}_ctile` : ''};`);
  });

  files['gamedata.c'] = [
    '/* Gerado pelo Sneslador */',
    '#include "sneslador.h"',
    ...externs,
    cArray('u16', 'sl_spr_first', sprFirst),
    cArray('u16', 'sl_spr_count', sprCount),
    cArray('u8', 'sl_spr_large', sprLarge),
    cArray('u8', 'sl_spr_pal', sprPal),
    cArray('u16', 'sl_frame_tile', frameTiles),
    cArray('u16', 'sl_anim_first', anFirst),
    cArray('u16', 'sl_anim_len', anLen),
    cArray('u16', 'sl_anim_speed', anSpeed),
    cArray('u8', 'sl_anim_loop', anLoop),
    cArray('u16', 'sl_anim_frames', anFrames),
    '',
    'void sl_load_scene_data(u16 scene) {',
    '\tswitch (scene) {',
    ...loadCases,
    '\t}',
    '}',
    '',
  ].join('\n');

  files['scripts.c'] = compiled.c;
  files['data.asm'] = asm.join('\n');
  files['sneslador.c'] = fs.readFileSync(path.join(RUNTIME_DIR, 'sneslador.c'));
  files['sneslador.h'] = fs.readFileSync(path.join(RUNTIME_DIR, 'sneslador.h'));

  // tamanho da ROM: soma dos dados + margem para o código
  const total = Object.values(files).reduce((a, f) => a + f.length, 0) + 96 * 1024;
  // o soundbank do snesmod vai a partir do banco 5 (fixo): reserva espaço extra
  const audioBytes = hasAudio ? Object.entries(files).filter(([k]) => k.endsWith('.it')).reduce((a, [, f]) => a + f.length, 0) : 0;
  const banks = [8, 16, 32].find((b) => b * 32768 >= total + audioBytes + (hasAudio ? 6 * 32768 : 0)) ?? 64;
  const romSizeCode = { 8: '08', 16: '09', 32: '0A', 64: '0B' }[banks];
  void compiledMusic;
  return { data, compiled, files, banks, romSizeCode, audioFiles };
}

function makeHeader(template, title, banks, romSizeCode) {
  const t = title.toUpperCase().replace(/[^A-Z0-9 !.-]/g, ' ').slice(0, 21).padEnd(21, ' ');
  return template
    .replace('@HIROMDEF@', '').replace('@FASTROMDEF@', '')
    .replace('@ROMTITLE@', t)
    .replace('@CARTRIDGETYPE@', '00').replace('@ROMSIZE@', romSizeCode).replace('@SRAMSIZE@', '00')
    .replace('@COUNTRY@', '01').replace('@LICENSEECODE@', '00').replace('@VERSION@', '00')
    .replace('@ROMBANKS@', String(banks)).replace('@ROMBANKSIZE@', '8000')
    .replace('@ROMMODE@', 'LOROM').replace('@ROMSPEED@', 'SLOWROM');
}

/**
 * Compila a ROM. log(msg) recebe o passo-a-passo (é mostrado no console do editor).
 * @returns {Promise<{rom:string, size:number, summary:string}>}
 */
export async function buildRom(project, { toolchainHome, buildDir, readAsset, log = () => {} }) {
  const t = toolchainPaths(toolchainHome);
  if (!toolchainOk(toolchainHome)) throw new Error('Toolchain PVSnesLib não encontrado. Instale pelo Hub (aba Toolchain).');

  log('1/5  Convertendo gráficos, mapas e paletas para o formato do SNES...');
  const gen = generateBuildFiles(project, { readAsset });
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  for (const [name, content] of Object.entries(gen.files)) fs.writeFileSync(path.join(buildDir, name), content);
  fs.writeFileSync(path.join(buildDir, 'hdr.asm'), makeHeader(fs.readFileSync(t.hdr, 'utf8'), gen.data.title, gen.banks, gen.romSizeCode));
  for (const w of gen.data.warnings) log('   aviso: ' + w);

  const extraAsm = [];
  if (gen.audioFiles.length) {
    log('2/5  Convertendo sons e músicas para o SPC700 (smconv / snesmod, amostras BRR)...');
    const out = await run(t.smconv, ['-s', '-o', 'soundbank', '-V', '-b', '5', ...gen.audioFiles], buildDir, () => {});
    const h = fs.readFileSync(path.join(buildDir, 'soundbank.h'), 'utf8');
    const sizes = [...h.matchAll(/_SIZE\s+(\d+)/g)].map((m) => Number(m[1]));
    if (sizes.length > 1) {
      const worst = Math.max(...sizes.slice(1).map((sz) => sz + sizes[0]));
      log(`     RAM de áudio: efeitos ${(sizes[0] / 1024).toFixed(1)} KB + maior música = ${(worst / 1024).toFixed(1)} KB de ~58 KB disponíveis`);
      if (worst > 58 * 1024) throw new Error('Efeitos + música passam de 58 KB (limite da RAM do SPC700). Use menos instrumentos ou sons mais curtos.');
    }
    void out;
    extraAsm.push('soundbank');
  } else log('2/5  Sem sons ou músicas.');

  log('3/5  Compilando C para assembly 65816 (816-tcc + 816-opt)...');
  const cfiles = ['sneslador', 'gamedata', 'scripts'];
  for (const f of cfiles) {
    await run(t.tcc, [`-I${t.inc1}`, `-I${t.inc2}`, '-I.', '-Wall', '-c', `${f}.c`, '-o', `${f}.ps`], buildDir, log);
    await run(t.opt, ['-i', `${f}.ps`, '-o', `${f}.asm`], buildDir, () => {});
  }

  log('4/5  Montando (wla-65816)...');
  const objs = [];
  for (const f of [...cfiles, 'data', 'hdr', ...extraAsm]) {
    await run(t.wla, ['-d', '-s', '-x', '-o', `${f}.obj`, `${f}.asm`], buildDir, log);
    objs.push(`${f}.obj`);
  }

  log('5/5  Ligando tudo numa ROM (wlalink)...');
  const libs = ['crt0_snes.obj', 'libc.obj', 'libm.obj', 'libtcc.obj'].map((f) => path.join(t.lib, f));
  fs.writeFileSync(path.join(buildDir, 'linkfile'), ['[objects]', ...objs, ...libs, ''].join('\n'));
  const romName = 'game.sfc';
  const out = await run(t.link, ['-d', '-s', '-v', '-A', '-c', '-L', t.lib, 'linkfile', romName], buildDir, () => {});
  const summary = out.split('\n').filter((l) => /ROM:|RAM:/.test(l)).join('\n');
  const rom = path.join(buildDir, romName);
  const size = fs.statSync(rom).size;
  log(`ROM pronta: ${(size / 1024) | 0} KB  ${summary.replace(/\n/g, ' | ')}`);
  return { rom, size, summary };
}
