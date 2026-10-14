# moushn reels

Моушн-работы про ИИ-контент.

| Что | Ссылка |
| --- | --- |
| Сайт-история «HUD латентного пространства» | https://leywinkw.github.io/moushn-reels/ |
| Шоурил, 15 с, HTML | https://leywinkw.github.io/moushn-reels/showreel.html |
| Шоурил, MP4 1080p60 с музыкой | https://leywinkw.github.io/moushn-reels/showreel.mp4 |

- `latent-site/` — Next.js-проект сайта. Контент — в `latent-site/src/lib/content.ts` (сейчас плейсхолдеры), подробности в [latent-site/README.md](latent-site/README.md).
- `showreel.html` — 15-секундный моушн-ролик одним файлом, без внешних библиотек.
- `showreel.mp4` — тот же ролик в 1920×1080, 60 к/с, с оригинальной синтезированной музыкой.

Каждый пуш в `main` пересобирает сайт и публикует его на GitHub Pages (`.github/workflows/pages.yml`).
