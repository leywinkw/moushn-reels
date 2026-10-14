import { T } from './config';

/* ---------- математика времени ---------- */
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pr = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (a: number, b: number, t: number) => smooth(pr(t, a, b));
export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
/** детерминированный хеш строки → 7 цифр (декоративный SEED) */
export function seedOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 10000000;
}
export const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;
const r1 = (v: number) => Math.round(v * 10) / 10;

/* ---------- сцены ---------- */
export type SceneId = 'hero' | 'offer' | 'pipeline' | 'formats' | 'cases' | 'showcase' | 'order' | 'faq' | 'final';

export interface Scene {
  id: SceneId;
  idx: number;
  start: number;
  dur: number;
  end: number;
  /** точки отдыха, абсолютные секунды (у кейсов — по одной на карточку) */
  rests: number[];
  noIn?: boolean;
  noExit?: boolean;
  hasCta: boolean;
  seed: number;
  /** vh от начала дорожки до первой точки отдыха — для якоря #id */
  anchorVh: number;
  /** параметры сцены, нужные и DOM, и движку */
  p: Record<string, number>;
}
export interface Beat { id: SceneId; end: number; vh: number }
export interface Timeline {
  scenes: Scene[];
  beats: Beat[];
  /** s при нулевом скролле — точка отдыха героя */
  s0: number;
  total: number;
  vhTotal: number;
  rests: number[];
}
export interface Counts {
  pipeline: number;
  formats: number;
  cases: number;
  casesMaxLen: number;
  showcase: number;
  order: number;
  orderMaxLen: number;
  faq: number;
  faqMaxLen: number;
}

type Spec = { id: SceneId; dur: number; rests: number[]; beats: [number, number][]; noIn?: boolean; noExit?: boolean; hasCta?: boolean; p?: Record<string, number> };

/** Такты: [локальный конец отрезка, vh]. Анимации 30–45 vh/с, пауза 20 vh, уход 12 vh. */
export function buildTimeline(n: Counts): Timeline {
  const specs: Spec[] = [];

  specs.push({ id: 'hero', dur: 4, rests: [T.heroRest], noIn: true, hasCta: true, beats: [[3.6, 16], [4, 14]] });

  specs.push({ id: 'offer', dur: 6, rests: [3], beats: [[2.4, 72], [3, 18], [5.6, 20], [6, 12]] });

  if (n.pipeline > 0) {
    const P = T.pipeline, rest = r1(P.first + n.pipeline * P.every + 0.1);
    const dur = Math.max(4, ceilTo(rest + 1.4, 0.5));
    specs.push({
      id: 'pipeline', dur, rests: [rest], p: { n: n.pipeline },
      beats: [[P.first, 28], [rest, Math.round((190 * (rest - P.first)) / 7.6)], [dur - 0.4, 20], [dur, 12]],
    });
  }

  if (n.formats > 0) {
    const F = T.formats, rowsEnd = F.first + (n.formats - 1) * F.every + F.count;
    const link = Math.max(F.link[0], ceilTo(rowsEnd + 0.5, 0.5)), rest = r1(link + (F.link[1] - F.link[0]));
    const dur = Math.max(10, ceilTo(rest + 1.4, 0.5));
    specs.push({
      id: 'formats', dur, rests: [rest], p: { n: n.formats, link },
      beats: [[1, 30], [link, Math.round((160 * (link - 1)) / 5)], [rest, 24], [dur - 0.4, 20], [dur, 12]],
    });
  }

  if (n.cases > 0) {
    // описание печатается с 1.0 с; к точке отдыха оно должно быть допечатано
    const K = T.cases.card, C0 = T.cases.typeAt, cps = Math.max(T.cases.cps, n.casesMaxLen / (3.0 - C0 - 0.05));
    const R = clamp(r1(C0 + n.casesMaxLen / cps + 0.05), 1.5, 3.0);
    const beats: [number, number][] = [], rests: number[] = [];
    for (let k = 0; k < n.cases; k++) {
      const o = k * K;
      beats.push([o + R, Math.round((48 * R) / 1.5)], [o + 3.1, 20], [o + K, 12]);
      rests.push(o + R);
    }
    specs.push({ id: 'cases', dur: K * n.cases, rests, beats, p: { n: n.cases, rest: R, cps } });
  }

  if (n.showcase > 0) {
    const S = T.showcase, rest = r1(S.every * (n.showcase - 1) + S.reveal + 0.4);
    specs.push({ id: 'showcase', dur: 4, rests: [rest], p: { n: n.showcase }, beats: [[rest, 40], [3.6, 20], [4, 12]] });
  }

  if (n.order > 0) {
    const O = T.order, typed = 0.5 + O.every * (n.order - 1) + n.orderMaxLen / O.cps;
    const rest = r1(Math.max(O.cta[1], typed) + 0.05);
    const dur = Math.max(5, ceilTo(rest + 1.4, 0.5));
    specs.push({ id: 'order', dur, rests: [rest], hasCta: true, p: { n: n.order }, beats: [[rest, 64], [dur - 0.4, 24], [dur, 12]] });
  }

  if (n.faq > 0) {
    const Q = T.faq, typed = 0.5 + Q.every * (n.faq - 1) + n.faqMaxLen / Q.cps;
    const rest = r1(Math.max(1.2, typed) + 0.05);
    const dur = Math.max(4, ceilTo(rest + 1.3, 0.5));
    specs.push({ id: 'faq', dur, rests: [rest], p: { n: n.faq }, beats: [[rest, 44], [dur - 0.4, 20], [dur, 12]] });
  }

  specs.push({ id: 'final', dur: 5, rests: [1.6], noExit: true, hasCta: true, beats: [[0.8, 30], [1.6, 26], [5, 14]] });

  // сборка абсолютного таймлайна
  const scenes: Scene[] = [];
  const beats: Beat[] = [];
  let start = 0;
  const s0 = T.heroRest;
  let vh = 0;
  specs.forEach((sp, idx) => {
    const sc: Scene = {
      id: sp.id, idx, start, dur: sp.dur, end: start + sp.dur,
      rests: sp.rests.map(r => start + r), noIn: sp.noIn, noExit: sp.noExit, hasCta: !!sp.hasCta,
      seed: seedOf(sp.id), anchorVh: 0, p: sp.p ?? {},
    };
    let anchorSet = false;
    for (const [le, v] of sp.beats) {
      const e = start + le;
      if (e <= s0 + 1e-6) continue; // интро героя идёт по времени, не по скроллу
      // якорь — на первой точке отдыха (до добавления отрезка, который ведёт дальше)
      if (!anchorSet && sc.rests[0] <= e + 1e-6) {
        const prevEnd = beats.length ? beats[beats.length - 1].end : s0;
        sc.anchorVh = vh + (v * Math.max(0, sc.rests[0] - prevEnd)) / Math.max(1e-6, e - prevEnd);
        anchorSet = true;
      }
      beats.push({ id: sp.id, end: e, vh: v });
      vh += v;
    }
    if (!anchorSet) sc.anchorVh = 0;
    scenes.push(sc);
    start += sp.dur;
  });

  return { scenes, beats, s0, total: start, vhTotal: vh, rests: scenes.flatMap(s => s.rests) };
}

/* ---------- скролл ↔ история (кусочно-линейно) ---------- */
export function storyFromScroll(tl: Timeline, y: number, vhPx: number) {
  let acc = 0, prev = tl.s0;
  for (const b of tl.beats) {
    const len = b.vh * vhPx;
    if (y <= acc + len) return lerp(prev, b.end, len > 0 ? (y - acc) / len : 1);
    acc += len;
    prev = b.end;
  }
  return prev;
}
export function scrollFromStory(tl: Timeline, s: number, vhPx: number) {
  let acc = 0, prev = tl.s0;
  if (s <= prev) return 0;
  for (const b of tl.beats) {
    const len = b.vh * vhPx;
    if (s <= b.end) return acc + len * ((s - prev) / Math.max(1e-6, b.end - prev));
    acc += len;
    prev = b.end;
  }
  return acc;
}

/* ---------- огибающие ---------- */
export function sceneAt(tl: Timeline, s: number) {
  for (const sc of tl.scenes) if (s < sc.end) return sc;
  return tl.scenes[tl.scenes.length - 1];
}
/** видимость сцены: вход первые 0.4 с, уход последние 0.4 с, без наложения */
export function envelope(sc: Scene, s: number) {
  const lt = s - sc.start;
  if (lt < 0 && !(sc.noIn && sc.idx === 0)) return { a: 0, exit: 0, lt };
  if (s > sc.end && !sc.noExit) return { a: 0, exit: 1, lt };
  const inA = sc.noIn ? 1 : smoothstep(0, T.sceneIn, lt);
  const exit = sc.noExit ? 0 : smoothstep(sc.dur - T.sceneOut, sc.dur, lt);
  return { a: inA * (1 - exit), exit, lt };
}

/** сколько нейронов горит в OFFER (синхронно со счётчиком) */
export function neuronsLit(lt: number, max: number) {
  return Math.round(max * ease.outQuart(pr(lt, T.offer.count[0], T.offer.count[1])));
}
/** пункт пайплайна k: начало, конец печати, [ OK ] (тропа дошла) */
export function pipelineItem(k: number) {
  const P = T.pipeline, t0 = P.first + k * P.every;
  return { t0, typed: t0 + P.type, ok: t0 + P.type + P.spin };
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
};
