# Сайт-история «HUD латентного пространства»

Next.js (App Router) + TypeScript, страница пререндерится статически. Без библиотек анимации:
рельеф — canvas 2D в Web Worker (OffscreenCanvas), тексты и HUD — DOM + CSS.

## Что заполнить

Весь контент — в **`src/lib/content.ts`**. Сейчас там каркас: всё в `[скобках]` — плейсхолдеры,
все цифры — демо. Замените своими данными и поставьте `demo: false` — исчезнет лента «ДЕМО-КОНТЕНТ».

- Пустой массив = сцены нет (FAQ, кейсы). Тайминги и такты прокрутки пересчитаются сами.
- Кадры кейсов: поле `image` у кейса (`src` в `public/…`, `width`, `height`, `alt`).
- Витрина работ: положите до 3 файлов `public/proof/*.webp` — размеры читаются из заголовка WebP при сборке.
- Домен: `meta.url` (нужен для абсолютных ссылок OG-картинки).
- Аналитика: `analytics.provider` = `plausible` / `umami`, плюс `src`, `domain` / `websiteId`.
- Цвета бренда: в `src/lib/config.ts` и `src/app/globals.css` меняйте только NEON, MINT и WM_MID.

## Команды

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npx next start -p 3124
npm run shots      # Playwright: WebKit + Chromium × 360×560, 390×844, 768×1024, 1440×900 в точках отдыха
npm run og         # переснять src/app/opengraph-image.png с героя (сервер на :3124)
```

Флаги проверки: `node scripts/shots.mjs <url> --only=webkit --vp=390x844 --reduced --nojs`.

## Клавиши

← / → — к соседней точке отдыха, `H` — спрятать HUD, `G` — зерно.

## Где что

| Файл | Что внутри |
| --- | --- |
| `src/lib/content.ts` | все тексты и ссылки |
| `src/lib/config.ts` | палитра, тайминги, параметры рельефа |
| `src/lib/timeline.ts` | сцены, огибающие, такты прокрутки (скролл ↔ время истории) |
| `src/lib/engine/` | движок рельефа: `engine.ts`, `noise.ts` (4D simplex), `latent.worker.ts` |
| `src/lib/client/controller.ts` | контроллер страницы: один rAF, HUD, клавиши, воркер |
| `src/lib/client/dom.ts` | Typer, Denoiser, Words, Counter, Reveal, глитч, кэш стилей |
| `src/components/Experience.tsx` | разметка сцен (серверный компонент) |
| `src/components/Boot.tsx` | единственный клиентский компонент — запускает контроллер |
| `src/fonts/` | JetBrains Mono, урезанная до латиницы, кириллицы и `░▒▓█ ▲ →` |
