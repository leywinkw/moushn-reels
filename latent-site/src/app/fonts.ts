import { Montserrat } from 'next/font/google';
import localFont from 'next/font/local';

/** Montserrat 900 italic — заголовки, вордмарк, большие цифры */
export const display = Montserrat({
  subsets: ['latin', 'cyrillic'],
  weight: ['900'],
  style: ['italic'],
  variable: '--f-display',
  display: 'swap',
});

/** JetBrains Mono 400/500/700 — урезана до латиницы, кириллицы и ░▒▓█ ▲ → (src/fonts) */
export const mono = localFont({
  src: [
    { path: '../fonts/JetBrainsMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/JetBrainsMono-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/JetBrainsMono-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--f-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
});
