/**
 * Текстовые эффекты и помощники стилей. Всё считается от локального времени сцены lt.
 * В DOM пишем только изменившиеся значения (кэш в WeakMap) — ноль React-ререндеров.
 */
import { T } from '../config';
import { clamp, ease, lerp, pr } from '../timeline';

const cache = new WeakMap<Element, Record<string, string>>();
function slot(el: Element) {
  let c = cache.get(el);
  if (!c) cache.set(el, (c = {}));
  return c;
}
export function css(el: Element, prop: string, val: string) {
  const c = slot(el);
  if (c[prop] === val) return;
  c[prop] = val;
  (el as HTMLElement).style.setProperty(prop, val);
}
export function setText(el: Element, val: string) {
  const c = slot(el);
  if (c['#text'] === val) return;
  c['#text'] = val;
  el.textContent = val;
}
export function toggle(el: Element, name: string, on: boolean) {
  const c = slot(el), k = 'cls:' + name, v = on ? '1' : '0';
  if (c[k] === v) return;
  c[k] = v;
  el.classList.toggle(name, on);
}
export const num = (v: string | undefined, d = 0) => (v === undefined || v === '' ? d : parseFloat(v));
export const nums = (v: string | undefined) => (v ?? '').split(',').map(x => parseFloat(x));

/** целочисленный хеш → [0, 1) — выбор глифа без Math.random */
export function ih(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
const BLOCKS = '▓▒░';
const GLYPHS = '01#%&*+-/<>=_[]{}$@~^:;';

export interface Fx { update(lt: number, reduced: boolean): void; reset?(): void }

/** Печать: «стрим токенов». Префиксы кэшируются, каретка мигает на активной строке. */
export class Typer implements Fx {
  private live: HTMLElement;
  private caret: HTMLElement | null;
  private text: string;
  private t0: number;
  private t1: number;
  private hold: number;
  private pre: string[] = [];
  constructor(private el: HTMLElement) {
    this.text = el.querySelector('.ghost')?.textContent ?? '';
    this.live = el.querySelector('.lt') as HTMLElement;
    this.caret = el.querySelector('.caret');
    this.t0 = num(el.dataset.t0);
    const cps = num(el.dataset.cps, 0);
    this.t1 = el.dataset.t1 ? num(el.dataset.t1) : this.t0 + this.text.length / (cps || 60);
    this.hold = el.dataset.hold === 'inf' ? Infinity : num(el.dataset.hold, 0.5);
  }
  private prefix(n: number) {
    return (this.pre[n] ??= this.text.slice(0, n));
  }
  update(lt: number, reduced: boolean) {
    const len = this.text.length;
    if (reduced) {
      setText(this.live, this.text);
      css(this.live, 'opacity', String(pr(lt, this.t0, this.t0 + 0.3)));
      if (this.caret) css(this.caret, 'display', 'none');
      return;
    }
    css(this.live, 'opacity', '1');
    const n = lt < this.t0 ? 0 : Math.min(len, Math.floor(((lt - this.t0) / Math.max(1e-6, this.t1 - this.t0)) * len + 1e-6));
    setText(this.live, this.prefix(n));
    if (this.caret) css(this.caret, 'display', lt >= this.t0 && lt <= this.t1 + this.hold ? 'inline-block' : 'none');
  }
}

/** Денойз: символы проявляются слева направо из шума ▓▒░ → глифы → буква. */
export class Denoiser implements Fx {
  private live: HTMLElement;
  private text: string;
  private t0: number;
  private t1: number;
  private last = '';
  constructor(el: HTMLElement) {
    this.text = el.querySelector('.ghost')?.textContent ?? '';
    this.live = el.querySelector('.lt') as HTMLElement;
    this.t0 = num(el.dataset.t0);
    this.t1 = num(el.dataset.t1, this.t0 + 0.6);
  }
  update(lt: number, reduced: boolean) {
    if (reduced) {
      setText(this.live, this.text);
      css(this.live, 'opacity', String(pr(lt, this.t0, this.t1)));
      return;
    }
    css(this.live, 'opacity', '1');
    let out: string;
    if (lt >= this.t1) out = this.text;
    else if (lt <= this.t0) out = '';
    else {
      const D = this.t1 - this.t0, spin = 0.45 * D, n = this.text.length, f = Math.floor(lt * 30);
      out = '';
      for (let i = 0; i < n; i++) {
        const c = this.text[i];
        if (c === ' ' || c === '\n') { out += c; continue; }
        const a = this.t0 + (n > 1 ? i / (n - 1) : 0) * (D - spin);
        if (lt < a) out += ' ';
        else if (lt >= a + spin) out += c;
        else {
          const q = (lt - a) / spin, h = ih(i, f);
          out += q < 1 / 3 ? BLOCKS[Math.floor(h * 3)] : GLYPHS[Math.floor(h * GLYPHS.length)];
        }
      }
    }
    if (out !== this.last) {
      this.last = out;
      setText(this.live, out);
    }
  }
}

/** Слова из-под масок: translateY(105%) → 0 с opacity, 0.05 с на слово, 0.45 с, easeOutCubic */
export class Words implements Fx {
  private words: HTMLElement[];
  private t0: number;
  constructor(el: HTMLElement) {
    this.words = Array.from(el.querySelectorAll<HTMLElement>('.wi'));
    this.t0 = num(el.dataset.t0);
  }
  update(lt: number, reduced: boolean) {
    this.words.forEach((w, k) => {
      const p = pr(lt, this.t0 + k * 0.05, this.t0 + k * 0.05 + 0.45);
      if (reduced) {
        css(w, 'transform', 'none');
        css(w, 'opacity', String(p));
        return;
      }
      const e = ease.outCubic(p);
      css(w, 'transform', e >= 1 ? 'none' : `translate3d(0,${((1 - e) * 105).toFixed(2)}%,0)`);
      css(w, 'opacity', e.toFixed(3));
    });
  }
}

/** Счётчик: ведущие нули цвета FRAME, easeOutQuart, «+» влетает easeOutBack, цифры «пинают» влево */
export class Counter implements Fx {
  private value: number;
  private digits: number;
  private t0: number;
  private t1: number;
  private pt: number[] | null;
  private z: HTMLElement;
  private d: HTMLElement;
  private plus: HTMLElement | null;
  private numEl: HTMLElement;
  constructor(el: HTMLElement, private u: () => number) {
    this.value = num(el.dataset.value);
    this.digits = String(Math.round(this.value)).length;
    this.t0 = num(el.dataset.t0);
    this.t1 = num(el.dataset.t1, this.t0 + 1);
    this.pt = el.dataset.plus ? nums(el.dataset.plus) : null;
    this.z = el.querySelector('.cz') as HTMLElement;
    this.d = el.querySelector('.cd') as HTMLElement;
    this.plus = el.querySelector('.cp');
    this.numEl = el.querySelector('.cn') as HTMLElement;
  }
  update(lt: number, reduced: boolean) {
    const p = reduced ? (lt >= this.t0 ? 1 : 0) : ease.outQuart(pr(lt, this.t0, this.t1));
    const v = Math.round(this.value * p), s = String(v).padStart(this.digits, '0');
    let z = 0;
    while (z < s.length - 1 && s[z] === '0') z++;
    if (v === 0) z = s.length;
    setText(this.z, s.slice(0, z));
    setText(this.d, s.slice(z));
    if (this.plus && this.pt) {
      const q = pr(lt, this.pt[0], this.pt[1]);
      if (reduced) {
        css(this.plus, 'opacity', q > 0 ? '1' : '0');
        css(this.plus, 'transform', 'none');
      } else {
        css(this.plus, 'opacity', clamp(q * 3).toFixed(3));
        css(this.plus, 'transform', q >= 1 ? 'none' : `scale(${lerp(1.9, 1, ease.outBack(q)).toFixed(3)})`);
        const k = Math.sin(Math.PI * pr(lt, this.pt[0], this.pt[0] + 0.3));
        css(this.numEl, 'transform', k > 0.001 ? `translate3d(${(-16 * this.u() * k).toFixed(2)}px,0,0)` : 'none');
      }
    }
  }
}

/** Проявление изображения «денойзом»: зерно 1→0, размытый слой 1→0, чёткий .3→1 */
export class Reveal implements Fx {
  private grain: HTMLElement | null;
  private blur: HTMLElement | null;
  private sharp: HTMLElement | null;
  private t0: number;
  constructor(el: HTMLElement) {
    this.grain = el.querySelector('.rv-grain');
    this.blur = el.querySelector('.rv-blur');
    this.sharp = el.querySelector('.rv-sharp');
    this.t0 = num(el.dataset.reveal);
  }
  update(lt: number) {
    const p = pr(lt, this.t0, this.t0 + T.denoiseImage);
    if (this.grain) css(this.grain, 'opacity', (1 - p).toFixed(3));
    if (this.blur) css(this.blur, 'opacity', (lt < this.t0 ? 0 : 1 - p).toFixed(3));
    if (this.sharp) css(this.sharp, 'opacity', (lt < this.t0 ? 0 : lerp(0.3, 1, p)).toFixed(3));
  }
}

/** Глитч как «артефакт генерации»: класс g1/g2 на 0.1 с, не чаще 3 раз в секунду */
const lastGlitch = new WeakMap<Element, { at: number; flip: boolean; timer: number }>();
export function glitch(el: Element | null, reduced: boolean) {
  if (!el || reduced) return;
  const now = performance.now(), st = lastGlitch.get(el) ?? { at: -1e9, flip: false, timer: 0 };
  if (now - st.at < 1000 / T.glitchMaxPerSec) return;
  st.at = now;
  st.flip = !st.flip;
  clearTimeout(st.timer);
  el.classList.remove('g1', 'g2');
  el.classList.add(st.flip ? 'g1' : 'g2');
  st.timer = window.setTimeout(() => el.classList.remove('g1', 'g2'), 100);
  lastGlitch.set(el, st);
}

/** Тайл шума 160×160 для зерна и денойз-проявлений */
export function noiseTile(size = 160): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const img = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(ih(i, 77) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
