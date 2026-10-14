/** Подпуть сайта (GitHub Pages) — для ссылок на файлы из public/ */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const asset = (src: string) => (src.startsWith('/') ? BASE + src : src);

/** Палитра. Другие цвета не вводить. Под другой бренд меняются только NEON, MINT и WM_MID. */
export const C = {
  BG: '#010803',
  PANEL: '#051B0D',
  DEEP: '#0B331A',
  LINE: '#3F6C50',
  FRAME: '#0A7131',
  MUTED: '#6E9E7E',
  NEON: '#0BF77F',
  MINT: '#64FAAE',
  WHITE: '#F7FBF8',
  WM_MID: '#4CF8A3',
  CODE: '#3B8252',
} as const;

export const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255] as const;
};
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Латентный рельеф */
export const RELIEF = {
  grid: 12, // шаг сетки поля плотности, px
  gridSteps: [12, 16, 22], // адаптивная деградация
  gridWeak: 16,
  octaves: 4,
  lacunarity: 2.03,
  gain: 0.5,
  scale: 1 / 600,
  breathe: 54.5, // период «дыхания», с
  breatheR: 0.55, // радиус петли в 4D-шуме
  densMax: 230,
  iso: 10, // шаг изолиний по плотности
  indexEvery: 5, // каждая 5-я — индексная
  labelStep: 290, // шаг подписей на индексных, px
  warp: 0.3, // шумовое искажение пиков
  lowHi: [90, 170] as const, // пороги прозрачности обычных изолиний
  alphas: [0.35, 0.47, 0.6] as const,
  dotStep: 16,
  dotThreshold: 0.16,
  cursor: { r: 150, h: 150 },
  frameBudget: 13, // мс; дольше — деградация
  idleFps: 12,
  weakFps: 30,
  idleAfter: 2000, // мс без скролла и курсора
} as const;

/** Камера: дрейф по синусам */
export const CAMERA = { driftX: 70, driftY: 40, driftZ: 0.025 } as const;

/** Догон скролла */
export const CHASE = { wheel: 0.1, touch: 0.05 } as const;

/** Длительности (с), общие для DOM-контроллера и движка рельефа */
export const T = {
  sceneIn: 0.4,
  sceneOut: 0.4,
  exitLift: 40, // u — уходящий текст уезжает вверх
  heroRest: 1.8,
  hud: { boot: 0.4 },
  offer: { count: [0.6, 2.4] as const, plus: [2.4, 2.75] as const, title: [0.15, 1.2] as const, sub: [0.9, 1.9] as const, edgeGrow: 0.35, maxNeurons: 150 },
  pipeline: { first: 1.0, every: 1.5, type: 0.85, spin: 0.5 },
  formats: { first: 1.0, every: 0.5, count: 1.0, hilite: 0.5, link: [6.0, 6.8] as const },
  cases: { card: 3.5, peak: 1.1, in: [0.3, 0.7] as const, tags: [0.5, 1.1] as const, cps: 55, typeAt: 1.0, out: [3.15, 3.5] as const },
  showcase: { every: 0.3, reveal: 0.6 },
  order: { every: 0.4, cps: 80, cta: [1.5, 1.9] as const },
  faq: { every: 0.45, cps: 100 },
  final: { frame: [0.1, 0.8] as const, rest: [0.5, 1.0] as const },
  glitchMaxPerSec: 3,
  ctaScanEvery: 7,
  denoiseImage: 0.6,
} as const;
