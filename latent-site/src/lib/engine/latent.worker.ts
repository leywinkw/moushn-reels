/// <reference lib="webworker" />
/**
 * Воркер рельефа: рисует на OffscreenCanvas. Главный поток шлёт следующий кадр
 * только после ответа «done» — в работе не больше одного кадра.
 */
import type { Timeline } from '../timeline';
import { LatentEngine, type EngineOpts, type FrameIn, type Layout } from './engine';

type FontSpec = { family: string; sources: { url: string; weight: string }[] };
type Msg =
  | { type: 'init'; canvas: OffscreenCanvas; tl: Timeline; opts: EngineOpts; w: number; h: number; dpr: number; layout: Layout | null; font: FontSpec | null }
  | { type: 'resize'; w: number; h: number; dpr: number; layout: Layout | null }
  | { type: 'layout'; layout: Layout }
  | { type: 'frame'; f: FrameIn };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: LatentEngine | null = null;

async function loadFont(spec: FontSpec) {
  try {
    const fonts = (scope as unknown as { fonts: FontFaceSet }).fonts;
    await Promise.all(
      spec.sources.map(async s => {
        const ff = new FontFace('LatentMono', `url(${s.url})`, { weight: s.weight });
        await ff.load();
        fonts.add(ff);
      }),
    );
    engine?.setFont('"LatentMono", monospace');
  } catch {
    /* остаёмся на системном моноширинном */
  }
}

scope.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      engine = new LatentEngine(m.canvas, m.tl, m.opts);
      engine.resize(m.w, m.h, m.dpr);
      if (m.layout) engine.setLayout(m.layout);
      if (m.font) void loadFont(m.font);
      break;
    case 'resize':
      engine?.resize(m.w, m.h, m.dpr);
      if (m.layout) engine?.setLayout(m.layout);
      break;
    case 'layout':
      engine?.setLayout(m.layout);
      break;
    case 'frame': {
      if (!engine) return;
      const out = engine.frame(m.f);
      scope.postMessage({ type: 'done', out });
      break;
    }
  }
};
