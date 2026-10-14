import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { content } from '@/lib/content';
import { C } from '@/lib/config';
import { analyticsScript } from '@/lib/analytics';
import { display, mono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || content.meta.url),
  title: content.meta.title,
  description: content.meta.description,
  openGraph: { title: content.meta.title, description: content.meta.description, type: 'website', locale: 'ru_RU' },
  twitter: { card: 'summary_large_image', title: content.meta.title, description: content.meta.description },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: C.BG,
};

/* Без JS: все сцены обычным потоком, видны тексты и итоговые цифры; HUD и canvas скрыты */
const NOSCRIPT = `<style>
.stage{position:relative!important;height:auto!important}
.frame{position:relative!important;height:auto!important}
.scene{position:relative!important;inset:auto!important;opacity:1!important;visibility:visible!important;min-height:100svh;padding:12svh 6vw!important;display:block!important}
.scene .sc-in{position:relative!important;display:flex!important;flex-direction:column;gap:24px;height:auto!important}
.scene .sc-in>*{position:relative!important;inset:auto!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;width:auto!important;max-width:60rem}
.case-card{margin-bottom:24px}
.hud,.relief,.grain,.scroll-hint,.track,.mbar,.map,.wm-frame,.wm-refl,.caret,.topnav .cta{display:none!important}
.topnav{position:static!important}
</style>`;

export default function RootLayout({ children }: { children: ReactNode }) {
  const an = analyticsScript();
  return (
    <html lang="ru" className={`${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
        {an && <script defer {...an} />}
      </head>
      <body>{children}</body>
    </html>
  );
}
