// Modelo de música estilo Mario Paint: uma pauta com colunas (batidas) e até 3 notas por coluna.
import { uid } from '../project.js';

// Posições da pauta, de baixo para cima: C4 (Dó central, linha suplementar) até C6
export const STAFF = [
  { name: 'Dó', oct: 4, midi: 60 }, { name: 'Ré', oct: 4, midi: 62 }, { name: 'Mi', oct: 4, midi: 64 },
  { name: 'Fá', oct: 4, midi: 65 }, { name: 'Sol', oct: 4, midi: 67 }, { name: 'Lá', oct: 4, midi: 69 },
  { name: 'Si', oct: 4, midi: 71 }, { name: 'Dó', oct: 5, midi: 72 }, { name: 'Ré', oct: 5, midi: 74 },
  { name: 'Mi', oct: 5, midi: 76 }, { name: 'Fá', oct: 5, midi: 77 }, { name: 'Sol', oct: 5, midi: 79 },
  { name: 'Lá', oct: 5, midi: 81 }, { name: 'Si', oct: 5, midi: 83 }, { name: 'Dó', oct: 6, midi: 84 },
];
// linhas da clave de sol: Mi4, Sol4, Si4, Ré5, Fá5
export const STAFF_LINES = [2, 4, 6, 8, 10];
export const MAX_NOTES_PER_COLUMN = 3; // como no Mario Paint (e cabe nos 8 canais do SNES com folga)

export function newSong(name) {
  return { id: uid('mus'), name, tempo: 150, length: 32, loop: true, notes: [] };
}

export function noteMidi(n) {
  return STAFF[n.p].midi + (n.a ?? 0);
}

/** Notas agrupadas por coluna, cada uma com o canal (0..2) que vai tocar. */
export function songColumns(song) {
  const cols = Array.from({ length: song.length }, () => []);
  for (const n of song.notes) if (n.c < song.length) cols[n.c].push(n);
  // ordena por instrumento para que cada instrumento tenda a ficar sempre no mesmo canal
  return cols.map((list) => list.slice(0, MAX_NOTES_PER_COLUMN).sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : a.p - b.p)));
}

export function instrumentsUsed(song) {
  return [...new Set(song.notes.map((n) => n.i))];
}

export const secondsPerColumn = (song) => 60 / song.tempo;
