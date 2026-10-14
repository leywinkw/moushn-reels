// Скриншоты в точках отдыха сцен: WebKit и Chromium × 360×560, 390×844, 768×1024, 1440×900.
// Проверяет: ничего не обрезано, нет горизонтального скролла, консоль пустая.
// node scripts/shots.mjs [url] [--only=chromium] [--vp=390x844] [--reduced]
import { chromium, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--')) ?? 'http://localhost:3123/';
const only = args.find(a => a.startsWith('--only='))?.split('=')[1];
const vpArg = args.find(a => a.startsWith('--vp='))?.split('=')[1];
const reduced = args.includes('--reduced');
const noJs = args.includes('--nojs');
const VPS = [[360, 560], [390, 844], [768, 1024], [1440, 900]].filter(([w, h]) => !vpArg || vpArg === `${w}x${h}`);
const BROWSERS = [['chromium', chromium], ['webkit', webkit]].filter(([n]) => !only || only === n);
mkdirSync('shots', { recursive: true });

let problems = 0;
for (const [bname, bt] of BROWSERS) {
  const browser = await bt.launch();
  for (const [w, h] of VPS) {
    const mobile = w < 768;
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile && bname !== 'firefox', hasTouch: w < 1024,
      reducedMotion: reduced ? 'reduce' : 'no-preference', javaScriptEnabled: !noJs,
    });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
    await page.goto(url, { waitUntil: 'networkidle' });
    const tag = `${bname}-${w}x${h}${reduced ? '-rm' : ''}${noJs ? '-nojs' : ''}`;
    if (noJs) {
      await page.screenshot({ path: `shots/${tag}-full.png`, fullPage: true });
      console.log(`${tag}: full page saved`);
      await ctx.close();
      continue;
    }
    await page.waitForFunction(() => window.__latent && window.__latent.engine.out, null, { timeout: 15000 }).catch(() => logs.push('engine: no frame in 15s'));
    await page.waitForTimeout(2200);
    const scenes = await page.evaluate(() => window.__latent.scenes);
    for (const sc of scenes) {
      for (const [ri, rest] of sc.rests.entries()) {
        const y = await page.evaluate(r => window.__latent.scrollFor(r), rest);
        await page.evaluate(y => window.scrollTo(0, y), y);
        await page.waitForFunction(r => Math.abs(window.__latent.s - r) < 0.01, rest, { timeout: 8000 }).catch(() => logs.push(`${sc.id}: s did not settle`));
        await page.waitForTimeout(450);
        const name = `${tag}-${sc.id}${sc.rests.length > 1 ? '-' + (ri + 1) : ''}`;
        await page.screenshot({ path: `shots/${name}.png` });
        const res = await page.evaluate(() => {
          const out = [];
          const W = innerWidth, H = innerHeight;
          if (document.documentElement.scrollWidth > W + 1) out.push(`horizontal scroll: ${document.documentElement.scrollWidth} > ${W}`);
          const scene = document.querySelector('.scene.is-on:not([style*="opacity: 0"])');
          const vis = el => {
            for (let n = el; n && n !== document.body; n = n.parentElement) {
              const cs = getComputedStyle(n);
              if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false;
            }
            return true;
          };
          const sel = 'h1,h2,h3,p,li,a,table,figure,dl,.case-card,.panel,.cta';
          document.querySelectorAll('.scene.is-on').forEach(sc => {
            sc.querySelectorAll(sel).forEach(el => {
              if (el.closest('.sr-only') || !vis(el)) return;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) return;
              if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)
                out.push(`out of frame: <${el.tagName.toLowerCase()} class="${el.className}"> ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}`);
            });
          });
          // перекрытие с HUD-показаниями
          const hudRects = Array.from(document.querySelectorAll('.h-tl, .h-tr, .demo, .h-bl, .h-br'))
            .filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
            .map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
          document.querySelectorAll('.scene.is-on').forEach(sc => sc.querySelectorAll('h1,h2,h3,p,li,table,.cta').forEach(el => {
            if (!vis(el) || el.closest('.sr-only')) return;
            const r = el.getBoundingClientRect();
            if (!r.height) return;
            for (const h of hudRects) if (r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top) { out.push(`under HUD: <${el.tagName.toLowerCase()} class="${el.className}">`); break; }
          }));
          // перекрытие с нижней панелью на телефоне
          const bar = document.querySelector('.mbar.show');
          if (bar && getComputedStyle(bar).display !== 'none') {
            const br = bar.getBoundingClientRect();
            document.querySelectorAll('.scene.is-on').forEach(sc => sc.querySelectorAll('p,li,h2,h3,a,table').forEach(el => {
              if (!vis(el) || el.closest('.sr-only')) return;
              const r = el.getBoundingClientRect();
              if (r.height && r.bottom > br.top + 2 && r.top < br.bottom) out.push(`under mbar: <${el.tagName.toLowerCase()} class="${el.className}">`);
            }));
          }
          return out;
        });
        if (res.length) { problems += res.length; console.log(`✗ ${name}\n   ${res.join('\n   ')}`); }
        else console.log(`✓ ${name}`);
      }
    }
    if (logs.length) { problems += logs.length; console.log(`  console (${tag}):\n   ${logs.join('\n   ')}`); }
    await ctx.close();
  }
  await browser.close();
}
console.log(problems ? `\n${problems} проблем(ы)` : '\nвсё чисто');
