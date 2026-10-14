/**
 * Контроллер страницы: «экран стоит, сцены сменяются».
 * Один requestAnimationFrame; скролл → позиция истории s (экспоненциальный догон);
 * сцены, эффекты текста и HUD считаются от s; рельеф рисует воркер.
 */
import { CHASE, RELIEF, T } from '../config';
import type { FrameOut, Layout, Rect } from '../engine/engine';
import { bindClicks, track } from '../analytics';
import {
  clamp, ease, envelope, fmtTime, pipelineItem, pr, sceneAt, scrollFromStory, storyFromScroll,
  type Scene, type SceneId, type Timeline,
} from '../timeline';
import { Counter, Denoiser, Reveal, Typer, Words, css, glitch, noiseTile, num, nums, setText, toggle, type Fx } from './dom';

export interface ControllerData {
  tl: Timeline;
  brand: string;
  names: Record<string, string>;
  offerMax: number;
  formats: { names: string[]; values: number[]; second: number };
  tools: string[];
  monoFamily: string;
}

type SceneState = { sc: Scene; el: HTMLElement; inner: HTMLElement; fx: Fx[]; on: boolean; extra?: (lt: number) => void };

export function startController(root: HTMLElement, data: ControllerData) {
  const { tl } = data;
  const stage = root.querySelector<HTMLElement>('.stage')!;
  const frameEl = root.querySelector<HTMLElement>('.frame')!;
  // canvas создаётся здесь: после transferControlToOffscreen его нельзя переиспользовать (StrictMode, HMR)
  const canvas = document.createElement('canvas');
  canvas.className = 'relief';
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);
  const mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mqReduced.matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8, cores = nav.hardwareConcurrency ?? 8;
  const weak = !!nav.connection?.saveData || mem <= 2 || (touch && mem <= 4 && cores <= 4);

  let U = 1, vhPx = innerHeight / 100, mode: 'wide' | 'tall' = 'wide';
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:calc(var(--u) * 1000);height:100vh;top:0;left:0';
  root.appendChild(probe);

  root.style.setProperty('--noise', `url(${noiseTile()})`);
  root.classList.add('ctl');

  /* ---------- эффекты по атрибутам ---------- */
  const uFn = () => U;
  class Appear implements Fx {
    private t: number; private d: number; private dy: number;
    constructor(private el: HTMLElement) { const v = nums(el.dataset.in); this.t = v[0] || 0; this.d = v[1] || 0.3; this.dy = isNaN(v[2]) ? 20 : v[2]; }
    update(lt: number, red: boolean) {
      const p = ease.outCubic(pr(lt, this.t, this.t + this.d));
      css(this.el, 'opacity', p.toFixed(3));
      css(this.el, 'transform', red || p >= 1 ? 'none' : `translate3d(0,${((1 - p) * this.dy * U).toFixed(2)}px,0)`);
    }
  }
  class Win implements Fx {
    private w: number[];
    constructor(private el: HTMLElement) { this.w = nums(el.dataset.win); }
    update(lt: number, red: boolean) {
      const [a, b, c, d] = this.w, pin = ease.outCubic(pr(lt, a, b)), pout = pr(lt, c, d);
      const from = nums((mode === 'tall' ? this.el.dataset.fromT : undefined) ?? this.el.dataset.from ?? '0,0');
      const to = nums((mode === 'tall' ? this.el.dataset.toT : undefined) ?? this.el.dataset.to ?? '0,0');
      const x = (from[0] * (1 - pin) + to[0] * pout) * U, y = (from[1] * (1 - pin) + to[1] * pout) * U;
      const op = pin * (1 - pout);
      css(this.el, 'opacity', op.toFixed(3));
      css(this.el, 'visibility', op > 0.001 ? 'visible' : 'hidden');
      css(this.el, 'transform', red || (x === 0 && y === 0) ? 'none' : `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`);
    }
  }
  class Bar implements Fx {
    private t: number[];
    constructor(private el: HTMLElement) { this.t = nums(el.dataset.sx); }
    update(lt: number) { css(this.el, 'transform', `scaleX(${ease.outQuart(pr(lt, this.t[0], this.t[1])).toFixed(4)})`); }
  }
  class Step implements Fx {
    private t: number[];
    constructor(private el: HTMLElement) { this.t = nums(el.dataset.step); }
    update(lt: number) { setText(this.el, `STEP ${String(Math.round(30 * pr(lt, this.t[0], this.t[1]))).padStart(2, '0')}/30`); }
  }
  class Fade implements Fx {
    private t: number[];
    constructor(private el: HTMLElement) { this.t = nums(el.dataset.fade); }
    update(lt: number) { css(this.el, 'opacity', pr(lt, this.t[0], this.t[1]).toFixed(3)); }
  }
  class Draw implements Fx {
    private t: number[]; private paths: SVGElement[]; private late: SVGElement[];
    constructor(el: HTMLElement) {
      this.t = nums(el.dataset.draw);
      this.paths = Array.from(el.querySelectorAll<SVGElement>('.dr'));
      this.late = Array.from(el.querySelectorAll<SVGElement>('.dl'));
    }
    update(lt: number, red: boolean) {
      const [a, b] = this.t, p = red ? (lt >= a ? 1 : 0) : ease.outCubic(pr(lt, a, b)), q = red ? p : pr(lt, a + 0.75 * (b - a), b);
      for (const el of this.paths) css(el, 'stroke-dashoffset', (1 - p).toFixed(4));
      for (const el of this.late) css(el, 'opacity', q.toFixed(3));
    }
  }
  class At implements Fx {
    private t: number; private prev = -1e9;
    constructor(private el: HTMLElement, private kind: 'glitch' | 'pulse') { this.t = num(kind === 'glitch' ? el.dataset.glitchAt : el.dataset.pulseAt); }
    reset() { this.prev = -1e9; }
    update(lt: number, red: boolean) {
      if (this.prev < this.t && lt >= this.t && lt - this.t < 0.5) {
        if (this.kind === 'glitch') glitch(this.el, red);
        else {
          this.el.classList.remove('pulse');
          void this.el.offsetWidth;
          this.el.classList.add('pulse');
        }
      }
      this.prev = lt;
    }
  }

  const collect = (el: HTMLElement): Fx[] => {
    const q = <E extends HTMLElement>(sel: string) => Array.from(el.querySelectorAll<E>(sel));
    return [
      ...q('.fx-type').map(e => new Typer(e)),
      ...q('.fx-dn').map(e => new Denoiser(e)),
      ...q('.fx-words').map(e => new Words(e)),
      ...q('.fx-count').map(e => new Counter(e, uFn)),
      ...q('[data-reveal]').map(e => new Reveal(e)),
      ...q('[data-in]').map(e => new Appear(e)),
      ...q('[data-win]').map(e => new Win(e)),
      ...q('[data-sx]').map(e => new Bar(e)),
      ...q('[data-step]').map(e => new Step(e)),
      ...q('[data-fade]').map(e => new Fade(e)),
      ...q('[data-draw]').map(e => new Draw(e)),
      ...q('[data-glitch-at]').map(e => new At(e, 'glitch')),
      ...q('[data-pulse-at]').map(e => new At(e, 'pulse')),
    ];
  };

  const states: SceneState[] = tl.scenes.flatMap(sc => {
    const el = root.querySelector<HTMLElement>(`.scene[data-scene="${sc.id}"]`);
    if (!el) return [];
    return [{ sc, el, inner: el.querySelector<HTMLElement>('.sc-in') ?? el, fx: collect(el), on: sc.idx === 0 }];
  });
  const st = (id: SceneId) => states.find(x => x.sc.id === id);

  /* ---------- сценовые надстройки ---------- */
  const hero = st('hero');
  const hint = root.querySelector<HTMLElement>('.scroll-hint');
  if (hero && hint) hero.extra = lt => css(hint, 'opacity', String(scrollY > 4 ? 0 : pr(lt, 1.1, 1.5)));

  const pipe = st('pipeline');
  if (pipe) {
    const items = Array.from(pipe.el.querySelectorAll<HTMLElement>('[data-pi]'));
    const SP = ['[ | ]', '[ / ]', '[ – ]', '[ \\ ]'];
    pipe.extra = lt => {
      items.forEach((it, k) => {
        const p = pipelineItem(k), next = k + 1 < items.length ? pipelineItem(k + 1).t0 : Infinity;
        toggle(it, 'is-cur', lt >= p.t0 && lt < next);
        const spin = it.querySelector('.pi-spin'), prog = it.querySelector('.pi-prog');
        if (spin) {
          if (lt < p.typed) setText(spin, '');
          else if (lt < p.ok) setText(spin, SP[Math.floor((lt - p.typed) / 0.08) % 4]);
          else setText(spin, '[ OK ]');
          toggle(spin, 'ok', lt >= p.ok);
        }
        if (prog) {
          const n = lt < p.typed ? 0 : Math.round(5 * pr(lt, p.typed, p.ok));
          setText(prog, lt < p.typed ? '' : '▓'.repeat(n) + (n < 5 ? '▒' : '') + '░'.repeat(Math.max(0, 4 - n)));
        }
      });
    };
  }

  const fmt = st('formats');
  if (fmt) {
    const rows = Array.from(fmt.el.querySelectorAll<HTMLElement>('[data-fr]'));
    const hn = fmt.el.querySelector('.fh-n'), hm = fmt.el.querySelector('.fh-m');
    const F = T.formats, rowsEnd = F.first + (rows.length - 1) * F.every + F.count;
    fmt.extra = lt => {
      let lit = 0;
      rows.forEach((r, i) => {
        const r0 = F.first + i * F.every;
        if (lt >= r0) lit++;
        toggle(r, 'hl', lt >= r0 && lt < r0 + F.hilite);
      });
      if (hn) setText(hn, String(lit));
      if (hm) setText(hm, String(Math.round(data.formats.second * ease.outQuart(pr(lt, F.first, rowsEnd)))));
    };
  }

  /* ---------- HUD ---------- */
  const hud = {
    scn: root.querySelector<HTMLElement>('.h-scn'),
    tc: root.querySelector<HTMLElement>('.h-tc'),
    bar: root.querySelector<HTMLElement>('.h-bar i'),
    lat: root.querySelector<HTMLElement>('.h-lat'),
    seed: root.querySelector<HTMLElement>('.h-seed'),
    neu: root.querySelector<HTMLElement>('.h-neu'),
  };
  const mbar = root.querySelector<HTMLElement>('.mbar');
  const nScenes = states.length, pad2 = (n: number) => String(n).padStart(2, '0');
  const sgn = (v: number) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1).padStart(6, '0');
  const bootLine = `> loading model ${data.brand}... [ OK ]`;
  let lastOut: FrameOut | null = null, doneUntil = 0, finalSeen = false;

  function updateHud(s: number, now: number) {
    const sc = sceneAt(tl, s), lt = s - sc.start;
    const since = now - t0;
    if (hud.scn) {
      if (since < T.hud.boot * 1000 && !reduced) setText(hud.scn, bootLine.slice(0, Math.ceil((bootLine.length * since) / (T.hud.boot * 1000 * 0.8))));
      else setText(hud.scn, `SCN ${pad2(sc.idx + 1)}/${pad2(nScenes)} · ${data.names[sc.id] ?? sc.id.toUpperCase()}`);
    }
    if (hud.tc) setText(hud.tc, `T+${fmtTime(Math.max(0, s))} / ${fmtTime(tl.total)}`);
    if (hud.bar) css(hud.bar, 'transform', `scaleX(${clamp(s / tl.total).toFixed(4)})`);
    if (hud.lat) {
      const c = lastOut?.cam ?? { x: 0, y: 0, z: 1 };
      setText(hud.lat, `LATENT X ${sgn(c.x)}  Y ${sgn(c.y)}  Z ${c.z.toFixed(2)}`);
    }
    if (hud.seed) {
      // у кейсов точка отдыха — своя на каждую карточку
      let r0 = sc.start, rest = sc.rests[0];
      for (let k = sc.rests.length - 1; k >= 0; k--) if (s >= sc.start + k * (sc.dur / sc.rests.length)) { r0 = sc.start + k * (sc.dur / sc.rests.length); rest = sc.rests[k]; break; }
      const step = Math.round(30 * pr(s, r0, rest));
      if (sc.id === 'final' && lt >= 1 && !finalSeen) { finalSeen = true; doneUntil = now + 1000; }
      if (sc.id !== 'final') finalSeen = false;
      setText(hud.seed, now < doneUntil ? 'STEP 30/30 · DONE' : `SEED ${String(sc.seed).padStart(7, '0')} · STEP ${pad2(step)}/30`);
      toggle(hud.seed, 'done', now < doneUntil);
    }
    if (hud.neu) setText(hud.neu, `NEURONS ${String(lastOut?.neurons ?? 0).padStart(3, '0')}`);
    if (mbar) toggle(mbar, 'show', !sc.hasCta);
  }

  /* ---------- сцены ---------- */
  function updateScenes(s: number) {
    for (const x of states) {
      const env = envelope(x.sc, s), on = env.a > 0.001;
      if (!on && !x.on) continue;
      if (on && !x.on) {
        track('scene_view', { scene: x.sc.id });
        x.fx.forEach(f => f.reset?.());
      }
      x.on = on;
      css(x.el, 'opacity', env.a.toFixed(3));
      css(x.el, 'visibility', on ? 'visible' : 'hidden');
      toggle(x.el, 'is-on', on);
      css(x.inner, 'transform', reduced || env.exit <= 0 ? 'none' : `translate3d(0,${(-T.exitLift * U * env.exit).toFixed(2)}px,0)`);
      if (!on) continue;
      for (const f of x.fx) f.update(env.lt, reduced);
      x.extra?.(env.lt);
    }
  }

  /* ---------- раскладка ---------- */
  const offsetRect = (el: HTMLElement): Rect => {
    let x = 0, y = 0, n: HTMLElement | null = el;
    while (n && n !== frameEl && n !== stage) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };

  function framePaths() {
    root.querySelectorAll<HTMLElement>('.wm').forEach(wm => {
      const svg = wm.querySelector('svg.wm-frame');
      if (!svg) return;
      const w = wm.offsetWidth, h = wm.offsetHeight, c = Math.max(8, 16 * U), tk = Math.max(5, 7 * U), acc = Math.max(12, 22 * U);
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const g1 = [0.63 * w, 0.71 * w], g2 = [0.22 * w, 0.31 * w], o = 0.75;
      const a = `M${g1[1]} ${o}H${w - c}L${w - o} ${c}V${h - c}L${w - c} ${h - o}H${g2[1]}`;
      const b = `M${g2[0]} ${h - o}H${c}L${o} ${h - c}V${c}L${c} ${o}H${g1[0]}`;
      const ticks = `M${g1[0]} ${o}v${-tk}M${g1[1]} ${o}v${-tk}M${g2[0]} ${h - o}v${tk}M${g2[1]} ${h - o}v${tk}M${o} ${h / 2}h${-tk}M${w - o} ${h / 2}h${tk}`;
      const accents = `M${o} ${c + acc}V${c}L${c} ${o}H${c + acc}M${w - o} ${h - c - acc}V${h - c}L${w - c} ${h - o}H${w - c - acc}`;
      const ps = svg.querySelectorAll('path');
      ps[0]?.setAttribute('d', a);
      ps[1]?.setAttribute('d', b);
      ps[2]?.setAttribute('d', ticks);
      ps[3]?.setAttribute('d', accents);
      const lab = wm.querySelector<HTMLElement>('.wm-label');
      if (lab) css(lab, 'left', `${(((g1[0] + g1[1]) / 2) / w) * 100}%`);
    });
  }

  function fitTitles() {
    const cv = document.createElement('canvas').getContext('2d')!;
    root.querySelectorAll<HTMLElement>('.fit').forEach(el => {
      el.style.fontSize = '';
      const cs = getComputedStyle(el), base = parseFloat(cs.fontSize);
      cv.font = `${cs.fontStyle} ${cs.fontWeight} ${base}px ${cs.fontFamily}`;
      const widest = Math.max(...(el.textContent ?? '').split(/\s+/).map(w => cv.measureText(w).width));
      const avail = el.clientWidth;
      if (avail > 0 && widest > avail) el.style.fontSize = `${Math.max(base * 0.45, (base * avail) / widest - 1)}px`;
    });
  }

  function measure(): Layout {
    U = probe.offsetWidth / 1000 || 1;
    vhPx = probe.offsetHeight / 100 || innerHeight / 100;
    const w = frameEl.clientWidth, h = frameEl.clientHeight;
    mode = w / h > 5 / 4 ? 'wide' : 'tall';
    framePaths();
    fitTitles();
    // tall: карточки кейсов лежат друг на друге внизу — карта забирает остаток над самой высокой
    const casesEl = root.querySelector<HTMLElement>('.sc-cases');
    if (casesEl) {
      const ch = Math.max(0, ...Array.from(casesEl.querySelectorAll<HTMLElement>('.case-card')).map(c => c.offsetHeight));
      casesEl.style.setProperty('--card-h', `${ch}px`);
    }
    const maps: Layout['maps'] = {}, avoid: Layout['avoid'] = {};
    root.querySelectorAll<HTMLElement>('.map[data-map]').forEach(m => (maps[m.dataset.map as SceneId] = offsetRect(m)));
    root.querySelectorAll<HTMLElement>('[data-avoid]').forEach(m => {
      const id = m.dataset.avoid as SceneId;
      (avoid[id] ??= []).push(offsetRect(m));
    });
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.case-card')).map(offsetRect);
    return { w, h, mode, u: U, maps, avoid, cards, formats: { names: data.formats.names, values: data.formats.values }, offerMax: data.offerMax };
  }

  /* ---------- рельеф ---------- */
  type EngineLike = { frame: (f: { s: number; tau: number; pointer: { x: number; y: number } | null; reduced: boolean }) => FrameOut; resize: (w: number, h: number, dpr: number) => void; setLayout: (l: Layout) => void };
  let worker: Worker | null = null, local: EngineLike | null = null, busy = false, ready = false, lastSent = 0, shown = false;
  let pointer: { x: number; y: number } | null = null, lastInput = performance.now();
  const dprOf = () => Math.min(devicePixelRatio || 1, weak ? 1 : touch ? 1.5 : 2);

  function fontSpec() {
    const fam = data.monoFamily.split(',')[0].replace(/['"]/g, '').trim(), sources: { url: string; weight: string }[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of Array.from(rules)) {
        if (!(r instanceof CSSFontFaceRule)) continue;
        if (r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim() !== fam) continue;
        const m = r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/);
        if (m) sources.push({ url: new URL(m[1], sheet.href ?? location.href).href, weight: r.style.getPropertyValue('font-weight') || '400' });
      }
    }
    return sources.length ? { family: fam, sources } : null;
  }

  function onFrame(out: FrameOut) {
    lastOut = out;
    busy = false;
    if (!shown) { shown = true; canvas.classList.add('on'); }
  }

  function startEngine() {
    const L = measure(), w = L.w, h = stage.clientHeight, dpr = dprOf();
    const opts = { weak, touch, fontFamily: 'monospace', tools: data.tools };
    if ('transferControlToOffscreen' in canvas && typeof Worker !== 'undefined') {
      try {
        const off = canvas.transferControlToOffscreen();
        worker = new Worker(new URL('../engine/latent.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<{ type: string; out: FrameOut }>) => { if (e.data.type === 'done') onFrame(e.data.out); };
        worker.onerror = () => { busy = false; };
        worker.postMessage({ type: 'init', canvas: off, tl, opts, w, h, dpr, layout: L, font: fontSpec() }, [off]);
        ready = true;
        return;
      } catch { worker = null; }
    }
    void import('../engine/engine').then(m => {
      const fam = data.monoFamily;
      local = new m.LatentEngine(canvas, tl, { ...opts, fontFamily: fam });
      local.resize(w, h, dpr);
      local.setLayout(L);
      ready = true;
    });
  }

  function engineFrame(now: number, s: number, settled: boolean) {
    if (!ready || busy || document.hidden) return;
    const idle = settled && now - lastInput > RELIEF.idleAfter && !intro;
    const minDt = idle ? 1000 / RELIEF.idleFps : weak ? 1000 / RELIEF.weakFps : 0;
    if (now - lastSent < minDt - 2) return;
    lastSent = now;
    const f = { s, tau: ((now - t0) / 1000) * (reduced ? 0.25 : 1), pointer, reduced };
    if (worker) { busy = true; worker.postMessage({ type: 'frame', f }); }
    else if (local) onFrame(local.frame(f));
  }

  /* ---------- скролл → история ---------- */
  const t0 = performance.now();
  let s = tl.s0, last = t0, raf = 0;
  let intro = !reduced && scrollY < 2 && !location.hash;
  if (intro) s = 0;
  else s = storyFromScroll(tl, scrollY, vhPx);
  const endIntro = () => { intro = false; };

  function tick(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const target = storyFromScroll(tl, scrollY, vhPx);
    if (intro) {
      s = Math.min(tl.s0, (now - t0) / 1000);
      if (s >= tl.s0 || scrollY > 2) endIntro();
    } else {
      const tau = touch ? CHASE.touch : CHASE.wheel;
      s += (target - s) * (1 - Math.exp(-dt / tau));
      if (Math.abs(target - s) < 1e-4) s = target;
    }
    updateScenes(s);
    updateHud(s, now);
    engineFrame(now, s, Math.abs(target - s) < 1e-3);
    raf = requestAnimationFrame(tick);
  }

  /* ---------- ввод ---------- */
  const restScroll = (r: number) => scrollFromStory(tl, r, vhPx) + 1;
  const goTo = (r: number) => { endIntro(); scrollTo({ top: restScroll(r), behavior: reduced ? 'auto' : 'smooth' }); };
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    lastInput = performance.now();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1, rests = tl.rests;
      const nx = dir > 0 ? rests.find(r => r > s + 0.05) : [...rests].reverse().find(r => r < s - 0.05);
      if (nx !== undefined) { e.preventDefault(); goTo(nx); }
    } else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') root.classList.toggle('hud-off');
    else if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') root.classList.toggle('grain-off');
  };
  const onClickNav = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1), sc = tl.scenes.find(x => x.id === id);
    if (!sc) return;
    e.preventDefault();
    history.replaceState(null, '', `#${id}`);
    goTo(sc.rests[0]);
  };
  const onInput = () => { lastInput = performance.now(); if (intro && scrollY > 2) endIntro(); };
  const onWheel = () => { lastInput = performance.now(); endIntro(); };
  const onPointer = (e: PointerEvent) => {
    lastInput = performance.now();
    pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
  };
  const onLeave = () => { pointer = null; };
  const onCtaEnter = (e: Event) => {
    const cta = (e.target as HTMLElement | null)?.closest?.('.cta');
    if (cta) glitch(cta.querySelector('.cta-label'), reduced);
  };
  const onMq = () => { reduced = mqReduced.matches; root.classList.toggle('reduced', reduced); };
  root.classList.toggle('reduced', reduced);

  addEventListener('keydown', onKey);
  addEventListener('scroll', onInput, { passive: true });
  addEventListener('wheel', onWheel, { passive: true });
  addEventListener('touchstart', onWheel, { passive: true });
  addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave);
  root.addEventListener('click', onClickNav);
  root.addEventListener('pointerover', onCtaEnter);
  root.addEventListener('touchstart', onCtaEnter, { passive: true });
  mqReduced.addEventListener('change', onMq);
  const unbindTrack = bindClicks(root);

  // ресайз: ResizeObserver с debounce 150 мс
  let rt = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      const L = measure(), h = stage.clientHeight, dpr = dprOf();
      if (worker) worker.postMessage({ type: 'resize', w: L.w, h, dpr, layout: L });
      else if (local) { local.resize(L.w, h, dpr); local.setLayout(L); }
    }, 150);
  });

  // отладка и автотесты: состояние и переход к точке отдыха
  (window as Window & { __latent?: unknown }).__latent = {
    get s() { return s; },
    get engine() { return { ready, busy, worker: !!worker, out: lastOut }; },
    rests: tl.rests,
    scenes: tl.scenes.map(x => ({ id: x.id, rests: x.rests })),
    scrollFor: (r: number) => restScroll(r),
  };

  // первая раскладка до старта, движок — после первой отрисовки
  measure();
  updateScenes(s);
  ro.observe(frameEl);
  raf = requestAnimationFrame(tick);
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const idleId = ric ? ric(startEngine, { timeout: 1200 }) : window.setTimeout(startEngine, 120);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(rt);
    if (!ric) clearTimeout(idleId);
    ro.disconnect();
    worker?.terminate();
    removeEventListener('keydown', onKey);
    removeEventListener('scroll', onInput);
    removeEventListener('wheel', onWheel);
    removeEventListener('touchstart', onWheel);
    removeEventListener('pointermove', onPointer);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    root.removeEventListener('click', onClickNav);
    root.removeEventListener('pointerover', onCtaEnter);
    root.removeEventListener('touchstart', onCtaEnter);
    mqReduced.removeEventListener('change', onMq);
    unbindTrack();
    probe.remove();
    canvas.remove();
  };
}
