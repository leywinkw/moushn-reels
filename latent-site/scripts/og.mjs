// OG-картинка 1200×630 — снимок героя в точке отдыха (без демо-ленты)
// node scripts/og.mjs [url]
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:3124/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__latent && window.__latent.engine.out && window.__latent.s >= 1.79, null, { timeout: 15000 });
await p.addStyleTag({ content: '.demo,.scroll-hint,.topnav,nextjs-portal{display:none!important}' });
await p.waitForTimeout(600);
const font = await p.evaluate(() => {
  const fam = getComputedStyle(document.querySelector('.hud')).fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  const rules = [];
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r instanceof CSSFontFaceRule && r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim() === fam) rules.push(r.style.getPropertyValue('font-weight')); } catch {} }
  return { fam, rules };
});
console.log('mono @font-face for worker:', JSON.stringify(font));
await p.screenshot({ path: 'src/app/opengraph-image.png' });
await b.close();
console.log('saved src/app/opengraph-image.png');
