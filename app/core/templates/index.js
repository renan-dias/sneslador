// Modelos de projeto. Cada um: { id, name, description, difficulty, icon, tutorial?, create(name) -> {project, files} }
import { createEmptyProject } from '../project.js';
import { createPong } from './pong.js';
import { createBlocos } from './blocos.js';
import { createLabirinto } from './labirinto.js';
import { createPlataforma } from './plataforma.js';
import { createAbertura } from './abertura.js';

export const TEMPLATES = [
  {
    id: 'vazio',
    name: 'Projeto vazio',
    description: 'Uma cena em branco, um tileset vazio e nenhum sprite. Para quem quer começar do zero.',
    difficulty: 0,
    icon: '⬜',
    create: (name) => ({ project: createEmptyProject(name), files: {} }),
  },
  {
    id: 'pong',
    name: 'Pong',
    description: 'Tênis de mesa contra o computador. O "Olá, mundo!" dos videogames.',
    difficulty: 1,
    icon: '🏓',
    create: (name, o) => createPong(name, o),
  },
  {
    id: 'blocos',
    name: 'Blocos que caem',
    description: 'Peças que caem e somem ao fechar linhas. Com a música Korobeiniki.',
    difficulty: 2,
    icon: '🧱',
    create: (name, o) => createBlocos(name, o),
  },
  {
    id: 'labirinto',
    name: 'Labirinto come-bolinhas',
    description: 'Coma todas as bolinhas fugindo de 3 fantasmas com inteligência artificial.',
    difficulty: 2,
    icon: '👻',
    create: (name, o) => createLabirinto(name, o),
  },
  {
    id: 'plataforma',
    name: 'Aventura de plataforma',
    description: 'Corra e pule com o robô Bit: blocos-surpresa, moedas, inimigos, parallax e 3 cenas.',
    difficulty: 3,
    icon: '🍄',
    create: (name, o) => createPlataforma(name, o),
  },
  {
    id: 'abertura',
    name: 'Abertura e menu',
    description: 'Splash screen com fade, menu com cursor, créditos e um mini-jogo. Ótimo ponto de partida.',
    difficulty: 1,
    icon: '🎬',
    create: (name, o) => createAbertura(name, o),
  },
];
