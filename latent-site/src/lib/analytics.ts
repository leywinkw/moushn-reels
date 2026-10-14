/**
 * Аналитика. По умолчанию ничего не делает. Адаптер Plausible или Umami включается
 * в content.analytics. Клики ловятся по data-track / data-place, плюс просмотр каждой сцены.
 */
import { content } from './content';

type Props = Record<string, string | number | boolean>;
type W = Window & {
  plausible?: (e: string, o?: { props?: Props }) => void;
  umami?: { track: (e: string, p?: Props) => void };
};

export function track(event: string, props: Props = {}) {
  if (typeof window === 'undefined') return;
  const w = window as W, a = content.analytics;
  try {
    if (a.provider === 'plausible') w.plausible?.(event, { props });
    else if (a.provider === 'umami') w.umami?.track(event, props);
  } catch {
    /* аналитика не должна ломать страницу */
  }
}

/** Делегирование кликов: <a data-track="cta" data-place="hero"> */
export function bindClicks(root: HTMLElement) {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-track]');
    if (!el) return;
    track(el.dataset.track!, { place: el.dataset.place ?? '', href: el.getAttribute('href') ?? '' });
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/** Атрибуты <script> для layout.tsx (или null, если аналитика выключена) */
export function analyticsScript(): Record<string, string> | null {
  const a = content.analytics;
  if (a.provider === 'none' || !a.src) return null;
  if (a.provider === 'plausible') return { src: a.src, 'data-domain': a.domain };
  return { src: a.src, 'data-website-id': a.websiteId };
}
