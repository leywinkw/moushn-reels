/**
 * Движок латентного рельефа. Один и тот же код работает в воркере (OffscreenCanvas)
 * и на главном потоке (фолбэк). Никакой зависимости от DOM.
 */
import { C, CAMERA, RELIEF, T, rgba } from '../config';
import { clamp, ease, lerp, neuronsLit, pipelineItem, pr, type SceneId, type Timeline } from '../timeline';
import { createNoise4, fbm4, hash2, mulberry32, type Noise4 } from './noise';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };
type Cam = { x: number; y: number; z: number };

export interface Layout {
  w: number;
  h: number;
  mode: 'wide' | 'tall';
  u: number;
  /** области «карт» по сценам (координаты экрана в точке отдыха, без transform) */
  maps: Partial<Record<SceneId, Rect>>;
  /** текстовые блоки, которые обходят нейроны */
  avoid: Partial<Record<SceneId, Rect[]>>;
  /** карточки кейсов в точке отдыха */
  cards: Rect[];
  formats: { names: string[]; values: number[] };
  offerMax: number;
}
export interface FrameIn { s: number; tau: number; pointer: Pt | null; reduced: boolean }
export interface FrameOut { cam: Cam; neurons: number; ms: number; dens: number; grid: number; dpr: number }
export interface EngineOpts { weak: boolean; touch: boolean; fontFamily: string; tools: string[] }

/* буфер отрезков изолиний одной группы */
class Seg {
  a = new Float32Array(8192);
  n = 0;
  push(x1: number, y1: number, x2: number, y2: number) {
    if (this.n + 4 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    const a = this.a, n = this.n;
    a[n] = x1; a[n + 1] = y1; a[n + 2] = x2; a[n + 3] = y2;
    this.n = n + 4;
  }
}

const HOME: Record<SceneId, [number, number]> = {
  hero: [0, 0],
  offer: [1100, -420],
  pipeline: [2300, 380],
  formats: [700, 1500],
  cases: [-1500, 700],
  showcase: [-600, -1500],
  order: [2900, -1700],
  faq: [1500, 2600],
  final: [0, 0],
};
const BANDS = 6;
const LOG_TPL = [
  (a: number, b: number) => `> sample --seed ${String(Math.floor(a * 1e7)).padStart(7, '0')} --steps 30`,
  (a: number) => {
    const k = 1 + Math.floor(a * 30), f = Math.round((k / 30) * 10);
    return `step ${String(k).padStart(2, '0')}/30 ${'▓'.repeat(Math.max(0, f - 2))}${f >= 2 ? '▒▒' : ''}${'░'.repeat(10 - Math.max(f, 2))}`;
  },
  (a: number) => `denoise ${(a * 0.9 + 0.05).toFixed(2)}`,
  (a: number, b: number) => `latent [${(a * 2 - 1).toFixed(3)} ${(b * 2 - 1).toFixed(3)} ${(a * b * 2 - 0.5).toFixed(3)} …]`,
  (a: number) => `upscale x${a > 0.5 ? 2 : 4}`,
  () => `[ OK ]`,
  (a: number) => `cfg ${(3 + a * 6).toFixed(1)} · eta ${(a * 0.3).toFixed(2)}`,
  (a: number, b: number) => `vae decode ${Math.round(256 + a * 768)}×${Math.round(256 + b * 768)}`,
];

export class LatentEngine {
  private ctx: Ctx;
  private canvas: AnyCanvas;
  private tl: Timeline;
  private opts: EngineOpts;
  private noise: Noise4;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private dprCap = 2;
  private gridIdx = 0;
  private grid: number = RELIEF.grid;
  private gw = 0;
  private gh = 0;
  private field = new Float32Array(1);
  private base = new Float32Array(1);
  private segs: Seg[] = Array.from({ length: 4 * BANDS }, () => new Seg());
  private layout: Layout | null = null;
  private keys: (Cam & { s: number })[] = [];
  private fog: AnyCanvas[] = [];
  private vignette: AnyCanvas | null = null;
  private slow: number[] = [];
  private lastTau = 0;
  private cursorH = 0;
  private cursorV = 0;
  private cursorPt: Pt | null = null;
  // аннотации (в мировых координатах)
  private neurons: { x: number; y: number; t: number; e: number[] }[] = [];
  private trail: Pt[] = [];
  private fPeaks: { x: number; y: number; r: number }[] = [];
  private cPeaks: Pt[] = [];
  private casesCams: Cam[] = [];
  private labelW = new Map<string, number>();

  constructor(canvas: AnyCanvas, tl: Timeline, opts: EngineOpts) {
    this.canvas = canvas;
    this.tl = tl;
    this.opts = opts;
    this.ctx = canvas.getContext('2d', { alpha: false }) as Ctx;
    this.noise = createNoise4(1337);
    if (opts.weak) {
      this.dprCap = 1;
      this.grid = RELIEF.gridWeak;
      this.gridIdx = 1;
    } else if (opts.touch) this.dprCap = 1.5;
    this.makeSprites();
  }

  setFont(family: string) {
    this.opts.fontFamily = family;
    this.labelW.clear();
  }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = Math.min(dpr, this.dprCap);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.allocField();
    this.makeVignette();
    if (this.layout) this.setLayout({ ...this.layout, w, h });
  }

  private allocField() {
    this.gw = Math.ceil(this.w / this.grid) + 2;
    this.gh = Math.ceil(this.h / this.grid) + 2;
    this.field = new Float32Array(this.gw * this.gh);
    this.base = new Float32Array(this.gw * this.gh);
  }

  private makeSprites() {
    const mk = (s: number) => {
      const c: AnyCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s, s) : Object.assign(document.createElement('canvas'), { width: s, height: s });
      return c;
    };
    this.fog = [C.DEEP, C.DEEP, C.NEON, C.NEON].map(col => {
      const c = mk(256), x = c.getContext('2d') as Ctx;
      const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, rgba(col, 1));
      g.addColorStop(0.45, rgba(col, 0.35));
      g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      return c;
    });
  }

  private makeVignette() {
    const w = Math.round(this.w), h = Math.round(this.h);
    const c: AnyCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const x = c.getContext('2d') as Ctx;
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, rgba(C.BG, 0));
    g.addColorStop(1, rgba(C.BG, 0.85));
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    this.vignette = c;
  }

  /* ---------- камера ---------- */
  private buildKeys() {
    const L = this.layout!, keys: (Cam & { s: number })[] = [];
    for (const sc of this.tl.scenes) {
      const [hx, hy] = HOME[sc.id], st = sc.start, rest = sc.rests[0];
      switch (sc.id) {
        case 'hero': keys.push({ s: 0, x: 0, y: 0, z: 1.12 }, { s: T.heroRest, x: 0, y: 0, z: 1 }); break;
        case 'offer': keys.push({ s: st + 0.4, x: hx, y: hy, z: 0.95 }, { s: st + T.offer.count[1], x: hx, y: hy, z: 0.8 }); break;
        case 'pipeline': keys.push({ s: st + 0.4, x: hx, y: hy, z: 1.05 }, { s: rest, x: hx + 80, y: hy + 30, z: 1 }); break;
        case 'formats': keys.push({ s: st + 0.4, x: hx, y: hy, z: 0.92 }, { s: rest, x: hx + 30, y: hy + 20, z: 0.9 }); break;
        case 'cases': {
          this.cPeaks = [];
          this.casesCams = [];
          const map = L.maps.cases, A = map ? { x: map.x + map.w / 2, y: map.y + map.h / 2 } : { x: L.w * 0.27, y: L.h * 0.56 };
          for (let k = 0; k < (sc.p.n || 0); k++) {
            const P = { x: hx - 900 * k, y: hy + (k % 2 ? 260 : -120) };
            this.cPeaks.push(P);
            const cam = { x: P.x - (A.x - L.w / 2), y: P.y - (A.y - L.h / 2), z: 1 };
            this.casesCams.push(cam);
            const o = st + k * T.cases.card;
            if (k > 0) keys.push({ s: o, ...this.casesCams[k - 1] });
            keys.push({ s: o + T.cases.peak, ...cam });
          }
          break;
        }
        case 'showcase': keys.push({ s: st + 0.4, x: hx, y: hy, z: 1 }); break;
        case 'order': keys.push({ s: st + 0.4, x: hx, y: hy, z: 1.1 }, { s: rest, x: hx + 40, y: hy - 20, z: 1.12 }); break;
        case 'faq': keys.push({ s: st + 0.4, x: hx, y: hy, z: 1 }); break;
        case 'final': keys.push({ s: st + 0.8, x: 0, y: 0, z: 1.05 }, { s: st + 1.6, x: 0, y: 0, z: 1 }); break;
      }
      if (!sc.noExit && keys.length) keys.push({ ...keys[keys.length - 1], s: sc.end - T.sceneOut });
    }
    keys.sort((a, b) => a.s - b.s);
    this.keys = keys;
  }

  private camAt(s: number): Cam {
    const k = this.keys;
    if (!k.length) return { x: 0, y: 0, z: 1 };
    if (s <= k[0].s) return { ...k[0] };
    for (let i = 0; i < k.length - 1; i++) {
      const a = k[i], b = k[i + 1];
      if (s < b.s) {
        const t = ease.inOut(pr(s, a.s, b.s));
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), t)) };
      }
    }
    return { ...k[k.length - 1] };
  }

  private toWorld(cam: Cam, sx: number, sy: number): Pt {
    return { x: (sx - this.w / 2) / cam.z + cam.x, y: (sy - this.h / 2) / cam.z + cam.y };
  }

  /* ---------- раскладка аннотаций ---------- */
  setLayout(L: Layout) {
    this.layout = { ...L, w: this.w, h: this.h };
    this.buildKeys();
    const sc = (id: SceneId) => this.tl.scenes.find(s => s.id === id);

    // OFFER: нейроны внутри карты, в обход текстовых блоков
    this.neurons = [];
    const offer = sc('offer'), om = L.maps.offer;
    if (offer && om && om.w > 10 && om.h > 10) {
      const cam = this.camAt(offer.start + T.offer.count[1]);
      const N = Math.max(0, Math.min(T.offer.maxNeurons, Math.round(L.offerMax)));
      const rnd = mulberry32(7), avoid = (L.avoid.offer ?? []).map(r => ({ x: r.x - 14, y: r.y - 14, w: r.w + 28, h: r.h + 28 }));
      const minD = Math.sqrt((om.w * om.h) / Math.max(1, N)) * 0.55;
      const pts: Pt[] = [];
      for (let tries = 0; pts.length < N && tries < N * 60; tries++) {
        const p = { x: om.x + rnd() * om.w, y: om.y + rnd() * om.h };
        if (avoid.some(r => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h)) continue;
        const d = tries < N * 40 ? minD : minD * 0.5;
        if (pts.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < d * d)) continue;
        pts.push(p);
      }
      // ближе к центру карты — раньше загораются
      const cx = om.x + om.w / 2, cy = om.y + om.h / 2;
      pts.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
      const [c0, c1] = T.offer.count;
      this.neurons = pts.map((p, i) => {
        const frac = (i + 0.5) / Math.max(1, pts.length), q = 1 - Math.pow(1 - frac, 0.25);
        const near = pts.slice(0, i).map((o, j) => ({ j, d: (o.x - p.x) ** 2 + (o.y - p.y) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 2).map(o => o.j);
        const wp = this.toWorld(cam, p.x, p.y);
        return { x: wp.x, y: wp.y, t: offer.start + c0 + q * (c1 - c0), e: near };
      });
    }

    // PIPELINE: точки тропы
    this.trail = [];
    const pipe = sc('pipeline'), pm = L.maps.pipeline;
    if (pipe && pm) {
      const cam = this.camAt(pipe.rests[0]), n = pipe.p.n || 0;
      for (let k = 0; k < n; k++) {
        const u = n > 1 ? k / (n - 1) : 0.5;
        const sx = pm.x + pm.w * (0.1 + 0.8 * u), sy = pm.y + pm.h * (0.5 + 0.3 * Math.sin(u * Math.PI * 2.2 + 0.5));
        this.trail.push(this.toWorld(cam, sx, sy));
      }
    }

    // FORMATS: пики-кластеры
    this.fPeaks = [];
    const fm = sc('formats'), fr = L.maps.formats;
    if (fm && fr) {
      const cam = this.camAt(fm.rests[0]), n = L.formats.values.length;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const sx = fr.x + fr.w * (0.1 + 0.8 * u), sy = fr.y + fr.h * (0.42 + (i % 2 ? 0.22 : -0.05) + 0.06 * Math.sin(i * 2.1));
        const p = this.toWorld(cam, sx, sy);
        this.fPeaks.push({ ...p, r: clamp((fr.w / n) * 0.42, 46, 120) / cam.z });
      }
    }
  }

  /* ---------- кадр ---------- */
  frame(f: FrameIn): FrameOut {
    const t0 = performance.now();
    const ctx = this.ctx, w = this.w, h = this.h, L = this.layout;
    const dt = clamp(f.tau - this.lastTau, 0, 0.1);
    this.lastTau = f.tau;

    // камера
    const cam = this.camAt(f.s);
    if (!f.reduced) {
      cam.x += Math.sin(f.tau * 0.13) * CAMERA.driftX;
      cam.y += Math.sin(f.tau * 0.1 + 1) * CAMERA.driftY;
      cam.z *= 1 + Math.sin(f.tau * 0.07 + 2) * CAMERA.driftZ;
    }

    // курсор: пик на пружине
    const ptr = f.pointer && !this.opts.touch ? f.pointer : null;
    if (ptr) this.cursorPt = this.toWorld(cam, ptr.x, ptr.y);
    this.cursorV += ((ptr ? RELIEF.cursor.h : 0) - this.cursorH) * 60 * dt - this.cursorV * 9 * dt;
    this.cursorH = Math.max(0, this.cursorH + this.cursorV * dt);

    const peaks = this.peaksAt(f.s);
    this.computeField(cam, f.tau, peaks);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, w, h);

    this.drawFog(f.tau);
    this.drawLogs(f.tau, f.s);
    this.drawDots(cam, f.tau);
    this.drawStrips(f.tau);
    this.drawIso(f.s);
    if (this.vignette) ctx.drawImage(this.vignette as CanvasImageSource, 0, 0, w, h);
    let lit = 0;
    if (L) lit = this.drawAnnotations(cam, f.s, f.tau);
    let dens = 0;
    if (ptr && this.cursorH > 1) dens = this.drawCursor(ptr);
    this.drawHud(cam);

    const ms = performance.now() - t0;
    this.adapt(ms);
    return { cam: { x: cam.x, y: cam.y, z: cam.z }, neurons: lit, ms, dens, grid: this.grid, dpr: this.dpr };
  }

  private adapt(ms: number) {
    this.slow.push(ms);
    if (this.slow.length < 20) return;
    const avg = this.slow.reduce((a, b) => a + b, 0) / this.slow.length;
    this.slow = [];
    if (avg <= RELIEF.frameBudget) return;
    if (this.gridIdx < RELIEF.gridSteps.length - 1) {
      this.gridIdx++;
      this.grid = RELIEF.gridSteps[this.gridIdx];
      this.allocField();
    } else if (this.dpr > 1) {
      this.dprCap = 1;
      this.resize(this.w, this.h, 1);
    }
  }

  /* ---------- поле плотности ---------- */
  private peaksAt(s: number) {
    const out: { x: number; y: number; r: number; h: number }[] = [];
    const sc = (id: SceneId) => this.tl.scenes.find(x => x.id === id);
    const fm = sc('formats');
    if (fm && this.layout) {
      const F = T.formats, vals = this.layout.formats.values;
      this.fPeaks.forEach((p, i) => {
        const r0 = fm.start + F.first + i * F.every;
        const k = ease.outCubic(pr(s, r0, r0 + F.count));
        if (k > 0) out.push({ ...p, h: (30 + 4.8 * vals[i]) * k });
      });
    }
    const cs = sc('cases');
    if (cs) {
      this.cPeaks.forEach((p, k) => {
        const o = cs.start + k * T.cases.card;
        const grow = ease.outCubic(pr(s, o, o + T.cases.peak));
        const settle = ease.inOut(pr(s, o + T.cases.out[0], o + T.cases.out[1] + 0.4));
        const hh = 160 * grow * (1 - 0.5 * settle);
        if (hh > 0) out.push({ x: p.x, y: p.y, r: 110, h: hh });
      });
    }
    if (this.cursorPt && this.cursorH > 0.5) out.push({ ...this.cursorPt, r: RELIEF.cursor.r, h: this.cursorH });
    return out;
  }

  private computeField(cam: Cam, tau: number, peaks: { x: number; y: number; r: number; h: number }[]) {
    const R = RELIEF, g = this.grid, gw = this.gw, gh = this.gh, F = this.field, B = this.base;
    const th = (2 * Math.PI * tau) / R.breathe, cz = Math.cos(th) * R.breatheR, cw = Math.sin(th) * R.breatheR;
    const sc = R.scale, iz = 1 / cam.z, hw = this.w / 2, hh = this.h / 2;
    const np = peaks.length;
    for (let j = 0; j < gh; j++) {
      const wy = (j * g - hh) * iz + cam.y;
      for (let i = 0; i < gw; i++) {
        const wx = (i * g - hw) * iz + cam.x;
        const n = fbm4(this.noise, wx * sc, wy * sc, cz, cw, R.octaves, R.lacunarity, R.gain);
        let d = (n * 0.5 + 0.5) * R.densMax;
        for (let p = 0; p < np; p++) {
          const pk = peaks[p], dx = wx - pk.x, dy = wy - pk.y, lim = pk.r * 3.2;
          if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
          const de = Math.sqrt(dx * dx + dy * dy) * (1 + R.warp * n);
          d += pk.h * Math.exp(-(de * de) / (2 * pk.r * pk.r));
        }
        const k = j * gw + i;
        F[k] = d;
        B[k] = n;
      }
    }
  }

  /** билинейная выборка поля в точке экрана */
  private sample(x: number, y: number) {
    const g = this.grid, i = clamp(Math.floor(x / g), 0, this.gw - 2), j = clamp(Math.floor(y / g), 0, this.gh - 2);
    const fx = clamp(x / g - i), fy = clamp(y / g - j), F = this.field, gw = this.gw;
    const a = F[j * gw + i], b = F[j * gw + i + 1], c = F[(j + 1) * gw + i], d = F[(j + 1) * gw + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  /* ---------- фон ---------- */
  private drawFog(tau: number) {
    const ctx = this.ctx, w = this.w, h = this.h, S = Math.max(w, h) * 0.9;
    ctx.globalCompositeOperation = 'screen';
    this.fog.forEach((sp, i) => {
      const x = w * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(tau * 0.031 + i * 1.9))), y = h * (0.25 + 0.5 * (0.5 + 0.5 * Math.cos(tau * 0.027 + i * 2.7)));
      ctx.globalAlpha = i < 2 ? 0.12 : 0.05;
      const s = S * (i < 2 ? 1.1 : 0.7);
      ctx.drawImage(sp as CanvasImageSource, x - s / 2, y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawLogs(tau: number, s: number) {
    const ctx = this.ctx, w = this.w, h = this.h, L = this.layout;
    if (!L || w < 520) return;
    const fs = clamp(11 * L.u * 1.15, 10, 12), lh = fs * 1.55, colW = Math.min(250, w * 0.17);
    const tools = this.opts.tools;
    ctx.font = `${fs}px ${this.opts.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.CODE;
    ctx.globalAlpha = 0.2;
    [0, 1].forEach(side => {
      const x = side ? w - colW - 18 : 18, off = tau * (side ? 11 : 15) + s * (side ? 22 : 34) + side * 777;
      const first = Math.floor(off / lh), shift = off - first * lh;
      const rows = Math.ceil(h / lh) + 1;
      for (let r = 0; r < rows; r++) {
        const idx = first + r, a = hash2(idx, side * 31 + 7), b = hash2(idx, side * 31 + 11);
        let line: string;
        if (tools.length && hash2(idx, 99) < 0.08) line = `> load ${tools[Math.floor(a * tools.length)]}`;
        else line = LOG_TPL[Math.floor(hash2(idx, side + 3) * LOG_TPL.length)](a, b);
        ctx.fillText(line, x, r * lh - shift + (side ? 4 : 0), colW);
      }
    });
    ctx.globalAlpha = 1;
  }

  private drawDots(cam: Cam, tau: number) {
    const ctx = this.ctx, w = this.w, h = this.h, step = RELIEF.dotStep / cam.z;
    const th = (2 * Math.PI * tau) / RELIEF.breathe, cz = Math.cos(th) * 0.4 + 9.1, cw = Math.sin(th) * 0.4 - 3.3;
    const x0 = Math.floor(((-w / 2) / cam.z + cam.x) / step) * step, y0 = Math.floor(((-h / 2) / cam.z + cam.y) / step) * step;
    const x1 = (w / 2) / cam.z + cam.x, y1 = (h / 2) / cam.z + cam.y;
    ctx.fillStyle = C.MUTED;
    for (let wy = y0; wy <= y1; wy += step) {
      const sy = (wy - cam.y) * cam.z + h / 2;
      for (let wx = x0; wx <= x1; wx += step) {
        const v = fbm4(this.noise, wx / 380, wy / 380, cz, cw, 2, 2.03, 0.5);
        if (v < RELIEF.dotThreshold) continue;
        const sx = (wx - cam.x) * cam.z + w / 2, big = v > 0.3;
        ctx.globalAlpha = big ? 0.42 : 0.26;
        const r = big ? 2.2 : 1.2;
        ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawStrips(tau: number) {
    const ctx = this.ctx, w = this.w, h = this.h, u = this.layout?.u ?? 1;
    const xs = [14 * u, 22 * u, w - 22 * u, w - 14 * u];
    xs.forEach((x, i) => {
      const fl = 0.5 + 0.5 * Math.sin(tau * (3 + i * 1.7) + i) * Math.sin(tau * 7.3 + i * 2);
      const y0 = h * (0.18 + 0.12 * hash2(i, 5)), len = h * (0.22 + 0.2 * hash2(i, 9));
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, rgba(C.NEON, 0));
      g.addColorStop(0.5, rgba(C.NEON, 1));
      g.addColorStop(1, rgba(C.NEON, 0));
      ctx.globalAlpha = 0.2 * (0.4 + 0.6 * fl);
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, 1, len);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- изолинии (marching squares) ---------- */
  private drawIso(s: number) {
    const ctx = this.ctx, w = this.w, h = this.h, R = RELIEF, g = this.grid, gw = this.gw, gh = this.gh, F = this.field;
    for (const sg of this.segs) sg.n = 0;

    // интро: проявление кольцом от центра (6 полос мягкости)
    const intro = s < 1.6 ? pr(s, 0.1, 1.5) : 1;
    const maxR = Math.hypot(w, h) * 0.55, Rr = ease.outCubic(intro) * maxR * 1.25, soft = maxR * 0.25;
    const cx = w / 2, cy = h / 2;
    const step = R.iso, idxStep = R.iso * R.indexEvery;
    const labels: { x: number; y: number; a: number; v: number; hw: number; hh: number }[] = [];
    const acc = new Map<number, number>();
    const lfs = clamp(10 * (this.layout?.u ?? 1), 9, 11);
    const minLD2 = 150 * 150;

    let curSg = this.segs[0], curIdx = false, curLev = 0;
    const emit = (x1: number, y1: number, x2: number, y2: number) => {
      curSg.push(x1, y1, x2, y2);
      if (!curIdx || intro < 1) return;
      const len = Math.hypot(x2 - x1, y2 - y1), sum = (acc.get(curLev) ?? 0) + len;
      if (sum < R.labelStep) { acc.set(curLev, sum); return; }
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      if (mx < 40 || mx > w - 40 || my < 40 || my > h - 40) return;
      for (const l of labels) if ((l.x - mx) ** 2 + (l.y - my) ** 2 < minLD2) return;
      let an = Math.atan2(y2 - y1, x2 - x1);
      if (an > Math.PI / 2) an -= Math.PI;
      if (an < -Math.PI / 2) an += Math.PI;
      const tw = this.textW(String(curLev), lfs);
      labels.push({ x: mx, y: my, a: an, v: curLev, hw: tw / 2 + 4, hh: lfs * 0.75 });
      acc.set(curLev, 0);
    };

    for (let j = 0; j < gh - 1; j++) {
      const y = j * g;
      for (let i = 0; i < gw - 1; i++) {
        const k = j * gw + i;
        const a = F[k], b = F[k + 1], c = F[k + gw + 1], d = F[k + gw];
        let lo = a, hi = a;
        if (b < lo) lo = b; else if (b > hi) hi = b;
        if (c < lo) lo = c; else if (c > hi) hi = c;
        if (d < lo) lo = d; else if (d > hi) hi = d;
        let lev = Math.ceil(lo / step) * step;
        if (lev <= 0) lev = step;
        const x = i * g;
        for (; lev < hi; lev += step) {
          const ca = a >= lev ? 1 : 0, cb = b >= lev ? 2 : 0, cc = c >= lev ? 4 : 0, cd = d >= lev ? 8 : 0;
          const cs = ca | cb | cc | cd;
          if (cs === 0 || cs === 15) continue;
          // точки на рёбрах: верх (a-b), право (b-c), низ (d-c), лево (a-d)
          const tx = x + g * ((lev - a) / (b - a)), ry = y + g * ((lev - b) / (c - b));
          const bx = x + g * ((lev - d) / (c - d)), ly = y + g * ((lev - a) / (d - a));
          const isIdx = lev % idxStep === 0;
          const sty = isIdx ? 3 : lev < R.lowHi[0] ? 0 : lev < R.lowHi[1] ? 1 : 2;
          let band = BANDS - 1;
          if (intro < 1) {
            const dd = Math.hypot(x - cx, y - cy), q = clamp((Rr - dd) / soft);
            if (q <= 0) continue;
            band = Math.min(BANDS - 1, Math.ceil(q * BANDS) - 1);
          }
          curSg = this.segs[sty * BANDS + band];
          curIdx = isIdx;
          curLev = lev;
          switch (cs) {
            case 1: case 14: emit(x, ly, tx, y); break;
            case 2: case 13: emit(tx, y, x + g, ry); break;
            case 3: case 12: emit(x, ly, x + g, ry); break;
            case 4: case 11: emit(x + g, ry, bx, y + g); break;
            case 5: emit(x, ly, tx, y); emit(x + g, ry, bx, y + g); break;
            case 6: case 9: emit(tx, y, bx, y + g); break;
            case 7: case 8: emit(x, ly, bx, y + g); break;
            case 10: emit(tx, y, x + g, ry); emit(x, ly, bx, y + g); break;
          }
        }
      }
    }

    const strokeGroup = (sg: Seg) => {
      if (!sg.n) return;
      ctx.beginPath();
      const a = sg.a;
      for (let q = 0; q < sg.n; q += 4) {
        ctx.moveTo(a[q], a[q + 1]);
        ctx.lineTo(a[q + 2], a[q + 3]);
      }
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    // обычные
    ctx.strokeStyle = C.LINE;
    ctx.lineWidth = 1;
    for (let sty = 0; sty < 3; sty++)
      for (let b = 0; b < BANDS; b++) {
        ctx.globalAlpha = R.alphas[sty] * ((b + 1) / BANDS);
        strokeGroup(this.segs[sty * BANDS + b]);
      }
    // индексные: под подписями — разрыв (clip evenodd)
    ctx.save();
    if (labels.length) {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      for (const l of labels) {
        const c = Math.cos(l.a), sn = Math.sin(l.a);
        const pts = [[-l.hw, -l.hh], [l.hw, -l.hh], [l.hw, l.hh], [-l.hw, l.hh]].map(([px, py]) => [l.x + px * c - py * sn, l.y + px * sn + py * c]);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let q = 1; q < 4; q++) ctx.lineTo(pts[q][0], pts[q][1]);
        ctx.closePath();
      }
      ctx.clip('evenodd');
    }
    ctx.strokeStyle = C.NEON;
    for (let b = 0; b < BANDS; b++) {
      const k = (b + 1) / BANDS;
      ctx.lineWidth = 5.5;
      ctx.globalAlpha = 0.1 * k;
      strokeGroup(this.segs[3 * BANDS + b]);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85 * k;
      strokeGroup(this.segs[3 * BANDS + b]);
    }
    ctx.restore();
    // подписи значений плотности
    ctx.font = `500 ${lfs}px ${this.opts.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.NEON;
    ctx.globalAlpha = 0.75;
    for (const l of labels) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.a);
      ctx.fillText(String(l.v), 0, 0.5);
      ctx.restore();
    }
    // бегущее тонкое кольцо — первый шаг денойза
    if (intro > 0 && intro < 1) {
      ctx.globalAlpha = 0.45 * (1 - intro);
      ctx.strokeStyle = C.NEON;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, Rr - soft * 0.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private textW(s: string, fs: number) {
    const key = s + '|' + fs;
    let v = this.labelW.get(key);
    if (v === undefined) {
      this.ctx.font = `500 ${fs}px ${this.opts.fontFamily}`;
      v = this.ctx.measureText(s).width;
      this.labelW.set(key, v);
    }
    return v;
  }

  /* ---------- аннотации сцен ---------- */
  private P(cam: Cam, p: Pt): Pt {
    return { x: (p.x - cam.x) * cam.z + this.w / 2, y: (p.y - cam.y) * cam.z + this.h / 2 };
  }

  private mono(px: number, wt = 500) {
    return `${wt} ${px}px ${this.opts.fontFamily}`;
  }

  private ring(x: number, y: number, age: number, dur: number, r0: number, r1: number, a = 0.8) {
    if (age < 0 || age > dur) return;
    const k = age / dur, ctx = this.ctx;
    ctx.globalAlpha = a * (1 - k);
    ctx.strokeStyle = C.NEON;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r0 + (r1 - r0) * ease.outCubic(k), 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawAnnotations(cam: Cam, s: number, tau: number) {
    const ctx = this.ctx, L = this.layout!, u = L.u, P = (p: Pt) => this.P(cam, p);
    const sc = (id: SceneId) => this.tl.scenes.find(x => x.id === id);
    let lit = 0;

    /* OFFER — нейроны и «веса» */
    const offer = sc('offer');
    if (offer && this.neurons.length && s >= offer.start) {
      lit = neuronsLit(s - offer.start, this.neurons.length);
      const vis = s < offer.end - T.sceneOut ? 1 : lerp(1, 0.22, pr(s, offer.end - T.sceneOut, offer.end + 1.2));
      const ns = this.neurons, sp = ns.map(n => P(n));
      ctx.strokeStyle = C.NEON;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.32 * vis;
      ctx.beginPath();
      for (let i = 0; i < lit; i++) {
        const g = pr(s, ns[i].t, ns[i].t + T.offer.edgeGrow);
        if (g <= 0) continue;
        const a = sp[i];
        for (const j of ns[i].e) {
          const b = sp[j];
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(lerp(b.x, a.x, g), lerp(b.y, a.y, g));
        }
      }
      ctx.stroke();
      ctx.fillStyle = C.NEON;
      ctx.globalAlpha = vis;
      for (let i = 0; i < lit; i++) ctx.fillRect(sp[i].x - 2, sp[i].y - 2, 4, 4);
      if (vis > 0.9) for (let i = 0; i < lit; i++) this.ring(sp[i].x, sp[i].y, s - ns[i].t, 0.5, 3, 16, 0.7);
    }

    /* PIPELINE — тропа генерации (Catmull-Rom, бегущий штрих) */
    const pipe = sc('pipeline');
    if (pipe && this.trail.length && s >= pipe.start) {
      const lt = s - pipe.start, vis = s < pipe.end - T.sceneOut ? 1 : lerp(1, 0.25, pr(s, pipe.end - T.sceneOut, pipe.end + 1));
      const pts = this.trail.map(P), src = { x: pts[0].x - 110 * u, y: pts[0].y + 50 * u }, all = [src, ...pts];
      const cr = (k: number, t: number) => {
        const p0 = all[Math.max(0, k - 1)], p1 = all[k], p2 = all[k + 1], p3 = all[Math.min(all.length - 1, k + 2)];
        const t2 = t * t, t3 = t2 * t;
        return {
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        };
      };
      const path = (full: boolean) => {
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        for (let k = 0; k < pts.length; k++) {
          const it = pipelineItem(k), g = full ? 1 : pr(lt, it.typed, it.ok);
          if (g <= 0) break;
          for (let q = 1; q <= 16; q++) {
            const t = (q / 16) * g, p = cr(k, t);
            ctx.lineTo(p.x, p.y);
          }
          if (g < 1) break;
        }
      };
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.LINE;
      ctx.globalAlpha = 0.35 * vis;
      ctx.setLineDash([2, 6]);
      path(true);
      ctx.stroke();
      ctx.strokeStyle = C.NEON;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.95 * vis;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -tau * 34;
      path(false);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.font = this.mono(clamp(11 * u, 10, 12), 700);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      pts.forEach((p, k) => {
        const it = pipelineItem(k), reached = lt >= it.ok;
        ctx.globalAlpha = (reached ? 1 : 0.35) * vis;
        ctx.fillStyle = reached ? C.NEON : C.LINE;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        if (reached) {
          ctx.fillStyle = C.WHITE;
          ctx.fillText(String(k + 1).padStart(2, '0'), p.x + 10, p.y - 12);
          this.ring(p.x, p.y, lt - it.ok, 0.7, 4, 30, 0.9 * vis);
        }
      });
    }

    /* FORMATS — метки пиков */
    const fm = sc('formats');
    if (fm && this.fPeaks.length && s >= fm.start && s < fm.end + 0.6) {
      const vis = s < fm.end - T.sceneOut ? 1 : 1 - pr(s, fm.end - T.sceneOut, fm.end + 0.4);
      const F = T.formats, fs = clamp(11 * u, 10, 12), roomy = (L.maps.formats?.h ?? 0) >= 90;
      ctx.font = this.mono(fs, 700);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      this.fPeaks.forEach((pk, i) => {
        const r0 = fm.start + F.first + i * F.every, k = pr(s, r0, r0 + F.count);
        if (k <= 0) return;
        const p = P(pk), v = Math.round(L.formats.values[i] * ease.outCubic(k)), name = (L.formats.names[i] ?? '').toUpperCase();
        const lx = p.x + 9, ly = p.y - 16;
        ctx.globalAlpha = vis * clamp(k * 3) * (roomy ? 1 : 0);
        ctx.fillStyle = C.NEON;
        ctx.fillText('▲', lx, ly);
        ctx.fillStyle = C.WHITE;
        ctx.fillText(String(v), lx + fs * 1.3, ly);
        ctx.fillStyle = C.MUTED;
        ctx.fillText(name, lx + fs * 1.3 + fs * 0.62 * (String(v).length + 1), ly);
        ctx.fillStyle = C.NEON;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        this.ring(p.x, p.y, s - r0, 0.8, 5, 46, 0.9 * vis);
      });
    }

    /* CASES — пики, выноски к карточкам, метки на хребте */
    const cs = sc('cases');
    if (cs && this.cPeaks.length && s >= cs.start - 0.4) {
      const fs = clamp(11 * u, 10, 12), Cc = T.cases;
      ctx.font = this.mono(fs, 700);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const sceneVis = s < cs.end - T.sceneOut ? 1 : 1 - pr(s, cs.end - T.sceneOut, cs.end + 0.6);
      this.cPeaks.forEach((pk, k) => {
        const o = cs.start + k * Cc.card, lt = s - o;
        if (lt < 0) return;
        const p = P(pk), grown = pr(lt, 0, Cc.peak), active = lt < Cc.card;
        ctx.globalAlpha = sceneVis * (active ? 1 : 0.6) * clamp(grown * 2);
        ctx.fillStyle = C.NEON;
        ctx.fillText(`▲ ${String(k + 1).padStart(2, '0')}`, p.x + 10, p.y - 14);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        if (lt < 0.9) this.ring(p.x, p.y, lt, 0.9, 6, 60, 0.8 * sceneVis);
        // выноска: два отрезка к карточке
        const card = L.cards[k];
        if (card && active) {
          const g = pr(lt, Cc.in[0], Cc.in[1]) * (1 - pr(lt, Cc.out[0], Cc.out[1]));
          if (g > 0) {
            // первый отрезок — под 45°, второй — прямой до кромки карточки
            const tall = L.mode === 'tall';
            let target: Pt, elbow: Pt;
            if (tall) {
              target = { x: clamp(p.x, card.x + 30 * u, card.x + card.w - 30 * u), y: card.y };
              const dx = target.x - p.x, dy = target.y - p.y, d = Math.min(Math.abs(dx), Math.max(0, Math.abs(dy) - 20 * u));
              elbow = { x: p.x + Math.sign(dx) * d, y: p.y + Math.sign(dy || 1) * d };
              if (Math.abs(dx) > d + 1) target = { x: elbow.x, y: card.y };
            } else {
              target = { x: card.x, y: clamp(p.y - 40 * u, card.y + 30 * u, card.y + card.h - 30 * u) };
              const dx = target.x - p.x, dy = target.y - p.y, d = Math.min(Math.abs(dy), Math.max(0, dx - 20 * u));
              elbow = { x: p.x + d, y: p.y + Math.sign(dy || -1) * d };
              if (Math.abs(dy) > d + 1) target = { x: card.x, y: elbow.y };
            }
            const l1 = Math.hypot(elbow.x - p.x, elbow.y - p.y), l2 = Math.hypot(target.x - elbow.x, target.y - elbow.y), tot = l1 + l2, d = tot * ease.outCubic(g);
            ctx.globalAlpha = 0.9 * sceneVis;
            ctx.strokeStyle = C.NEON;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            if (d <= l1) ctx.lineTo(lerp(p.x, elbow.x, d / l1), lerp(p.y, elbow.y, d / l1));
            else {
              ctx.lineTo(elbow.x, elbow.y);
              ctx.lineTo(lerp(elbow.x, target.x, (d - l1) / l2), lerp(elbow.y, target.y, (d - l1) / l2));
            }
            ctx.stroke();
            if (d >= tot - 0.5) ctx.fillRect(target.x - 2, target.y - 2, 4, 4);
          }
        }
      });
    }
    ctx.globalAlpha = 1;
    return lit;
  }

  /* ---------- курсор ---------- */
  private drawCursor(p: Pt) {
    const ctx = this.ctx, d = this.sample(p.x, p.y), a = clamp(this.cursorH / RELIEF.cursor.h);
    ctx.globalAlpha = 0.85 * a;
    ctx.strokeStyle = C.NEON;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 16, p.y); ctx.lineTo(p.x - 6, p.y);
    ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 16, p.y);
    ctx.moveTo(p.x, p.y - 16); ctx.lineTo(p.x, p.y - 6);
    ctx.moveTo(p.x, p.y + 6); ctx.lineTo(p.x, p.y + 16);
    ctx.stroke();
    ctx.font = this.mono(10, 500);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.MUTED;
    ctx.fillText('DENS', p.x + 14, p.y + 12);
    ctx.fillStyle = C.NEON;
    ctx.fillText(String(Math.round(d)).padStart(4, '0'), p.x + 46, p.y + 12);
    ctx.globalAlpha = 1;
    return d;
  }

  /* ---------- HUD-графика: скобки, линейки, сетка ---------- */
  private drawHud(cam: Cam) {
    const ctx = this.ctx, w = this.w, h = this.h, u = this.layout?.u ?? 1;
    const m = clamp(28 * u, 14, 30), len = clamp(26 * u, 14, 28), z = cam.z;
    // сетка 240 с крестиками, параллакс .9
    const px = cam.x * 0.9, py = cam.y * 0.9, G = 240;
    ctx.strokeStyle = C.LINE;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gx0 = Math.floor(((-w / 2) / z + px) / G) * G, gy0 = Math.floor(((-h / 2) / z + py) / G) * G;
    for (let wx = gx0; (wx - px) * z + w / 2 < w + G; wx += G)
      for (let wy = gy0; (wy - py) * z + h / 2 < h + G; wy += G) {
        const sx = (wx - px) * z + w / 2, sy = (wy - py) * z + h / 2;
        ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy);
        ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4);
      }
    ctx.stroke();
    // линейки: засечки каждые 24 единицы мира, подписи каждые 240
    const showLabels = w >= 600;
    ctx.font = this.mono(clamp(9 * u, 8, 10), 500);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const tick = (horiz: boolean) => {
      const span = horiz ? w : h, c = horiz ? cam.x : cam.y, a0 = m + len + 10, a1 = span - m - len - 10;
      const w0 = Math.ceil(((a0 - span / 2) / z + c) / 24) * 24;
      ctx.beginPath();
      for (let wv = w0; ; wv += 24) {
        const sv = (wv - c) * z + span / 2;
        if (sv > a1) break;
        const major = wv % 240 === 0, tl = major ? 7 : 3;
        if (horiz) { ctx.moveTo(sv, m); ctx.lineTo(sv, m + tl); }
        else { ctx.moveTo(m, sv); ctx.lineTo(m + tl, sv); }
        if (major && showLabels) {
          ctx.fillStyle = C.MUTED;
          const txt = (wv > 0 ? '+' : wv < 0 ? '−' : '') + Math.abs(wv);
          if (horiz) ctx.fillText(txt, sv + 3, m + 8);
          else ctx.fillText(txt, m + 9, sv + 2);
        }
      }
      ctx.strokeStyle = C.LINE;
      ctx.globalAlpha = 0.8;
      ctx.stroke();
    };
    ctx.globalAlpha = 0.55;
    tick(true);
    ctx.globalAlpha = 0.55;
    tick(false);
    // уголки-скобки
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = C.NEON;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      ctx.moveTo(x, y + sy * len);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * len, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
