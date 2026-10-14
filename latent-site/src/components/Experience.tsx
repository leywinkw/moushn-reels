import type { CSSProperties, ReactNode } from 'react';
import Boot from './Boot';
import { content } from '@/lib/content';
import { T, asset } from '@/lib/config';
import { pipelineItem, type Timeline } from '@/lib/timeline';
import type { Proof } from '@/lib/proof';

const pad2 = (n: number) => String(n).padStart(2, '0');
const r2 = (v: number) => Math.round(v * 100) / 100;
function plural(n: number, [one, few, many]: readonly [string, string, string]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/* ---------- эффекты текста: «призрак» держит место и читается скринридером ---------- */
function Type({ text, t0, t1, cps, hold, className = '' }: { text: string; t0: number; t1?: number; cps?: number; hold?: number | 'inf'; className?: string }) {
  return (
    <span className={`fx fx-type ${className}`} data-t0={r2(t0)} data-t1={t1 !== undefined ? r2(t1) : undefined} data-cps={cps} data-hold={hold}>
      <span className="ghost">{text}</span>
      <span className="live" aria-hidden="true"><span className="lt" /><i className="caret" /></span>
    </span>
  );
}
function Dn({ text, t0, t1, className = '' }: { text: string; t0: number; t1: number; className?: string }) {
  return (
    <span className={`fx fx-dn ${className}`} data-t0={r2(t0)} data-t1={r2(t1)}>
      <span className="ghost">{text}</span>
      <span className="live" aria-hidden="true"><span className="lt" /></span>
    </span>
  );
}
function Words({ text, t0, accent = [] }: { text: string; t0: number; accent?: string[] }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className="fx-words" data-t0={t0}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="w"><span className={`wi${accent.includes(w) ? ' ac' : ''}`}>{w}</span></span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}
function Count({ value, t0, t1, plus }: { value: number; t0: number; t1: number; plus?: [number, number] }) {
  return (
    <span className="fx-count" data-value={value} data-t0={t0} data-t1={t1} data-plus={plus?.join(',')}>
      <span className="cn"><span className="cz" /><span className="cd">{value}</span></span>
      {plus && <span className="cp">+</span>}
    </span>
  );
}
function Cap({ text, t0 = 0.1, id, tag = 'h2' }: { text: string; t0?: number; id?: string; tag?: 'h2' | 'p' }) {
  const Tag = tag;
  return (
    <Tag className="cap" id={id}>
      <span className="cap-sl" aria-hidden="true">//</span> <Dn text={text} t0={t0} t1={t0 + 0.6} />
      <span className="cap-ln" aria-hidden="true" data-sx={`${t0},${r2(t0 + 0.6)}`} />
    </Tag>
  );
}

function Wordmark({ draw, refl, glitchAt }: { draw: readonly [number, number]; refl?: readonly [number, number]; glitchAt: number }) {
  const b = content.brand;
  return (
    <span className="wm-wrap">
      <span className="wm" data-draw={draw.join(',')}>
        <span className="wm-label dl" aria-hidden="true">{b.label}</span>
        <svg className="wm-frame" aria-hidden="true" preserveAspectRatio="none">
          <path className="dr" pathLength={1} />
          <path className="dr" pathLength={1} />
          <path className="dl wm-ticks" />
          <path className="dl wm-acc" />
        </svg>
        <span className="wm-text glitch" data-text={b.name} data-glitch-at={glitchAt}>{b.name}</span>
      </span>
      {refl && (
        <span className="wm-refl" aria-hidden="true" data-fade={refl.join(',')}>
          <span className="wm-text">{b.name}</span>
        </span>
      )}
    </span>
  );
}

function Cta({ place, small = false, inAt }: { place: string; small?: boolean; inAt?: string }) {
  const c = content.cta;
  return (
    <a className={`cta${small ? ' cta-s' : ''}`} href={c.href} data-track="cta" data-place={place} data-in={inAt}>
      <span className="cta-glow" aria-hidden="true" />
      <span className="cta-scan" aria-hidden="true" />
      <span className="cta-label glitch" data-text={c.text}>{c.text}</span>
      <span className="cta-arrow" aria-hidden="true">→</span>
    </a>
  );
}

function Frame({ children, reveal, img, seed }: { children?: ReactNode; reveal: number; img?: { src: string; width: number; height: number; alt: string }; seed?: number }) {
  return (
    <figure className="frame-img" data-reveal={r2(reveal)}>
      <span className="frame-in">
        {img ? (
          <>
            <img className="rv-blur" src={img.src} width={img.width} height={img.height} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            <img className="rv-sharp" src={img.src} width={img.width} height={img.height} alt={img.alt} loading="lazy" decoding="async" />
          </>
        ) : (
          <span className="rv-sharp ph">{children}</span>
        )}
        <span className="rv-grain" aria-hidden="true" />
        <span className="scan" aria-hidden="true" />
        {img && <span className="badge">AI-GENERATED</span>}
      </span>
      {seed !== undefined && <figcaption className="seed">SEED {String(seed).padStart(7, '0')}</figcaption>}
    </figure>
  );
}

/* ---------- страница ---------- */
export default function Experience({ tl, proof, monoFamily }: { tl: Timeline; proof: Proof[]; monoFamily: string }) {
  const c = content;
  const has = (id: string) => tl.scenes.some(s => s.id === id);
  const sc = (id: string) => tl.scenes.find(s => s.id === id);

  const F = T.formats, fmax = Math.max(1, ...c.formats.items.map(f => f.value));
  const fLink = sc('formats')?.p.link ?? F.link[0];
  const brandSlug = c.brand.name.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="exp">
      <Boot
        tl={tl}
        data={{
          brand: c.brand.name,
          names: c.hud.names,
          offerMax: c.offer.main.value,
          formats: { names: c.formats.items.map(f => f.name), values: c.formats.items.map(f => f.value), second: c.formats.second.value },
          tools: c.tools,
          monoFamily,
        }}
      />
      <div className="stage">
        <div className="frame">
          {/* 0. HERO */}
          <section className="scene sc-hero is-first" data-scene="hero" aria-labelledby="h-hero">
            <div className="sc-in hero-in">
              <h1 id="h-hero" className="hero-h1">
                <Wordmark draw={[0.05, 0.9]} refl={[0.2, 0.8]} glitchAt={0.25} />
                <span className="sr-only"> — {c.offer.title}</span>
              </h1>
              <p className="hero-prompt deco"><Type text={`> prompt: "${c.promptShort}"`} t0={0.2} t1={0.6} hold={0.3} /></p>
              <p className="hero-slogan halo"><Dn text={c.slogan} t0={0.4} t1={1.2} /></p>
              <div className="hero-cta" data-in="0.9,0.4,16">
                <Cta place="hero" />
                <p className="micro">{c.cta.note}</p>
              </div>
            </div>
            <div className="scroll-hint" aria-hidden="true">
              <svg className="sh-mouse" viewBox="0 0 22 34" data-draw="1.0,1.5">
                <rect className="dr" x="1" y="1" width="20" height="32" rx="10" pathLength={1} />
                <circle className="sh-dot" cx="11" cy="9" r="2" />
              </svg>
              <span className="sh-label"><Dn text="SCROLL" t0={1.1} t1={1.5} /></span>
              <span className="sh-chev"><i /><i /></span>
            </div>
          </section>

          {/* 1. OFFER */}
          <section className="scene sc-offer" data-scene="offer" aria-labelledby="h-offer">
            <div className="sc-in">
              <div className="map" data-map="offer" aria-hidden="true" />
              <div className="offer-text shade" data-avoid="offer">
                <Cap text={c.offer.caption} t0={0.05} tag="p" />
                <h2 id="h-offer" className="offer-title halo"><Words text={c.offer.title} t0={T.offer.title[0]} accent={c.offer.accent} /></h2>
                <p className="offer-sub halo"><Dn text={c.offer.subtitle} t0={T.offer.sub[0]} t1={T.offer.sub[1]} /></p>
              </div>
              <div className="offer-fig shade" data-avoid="offer">
                <p className="fig-main"><Count value={c.offer.main.value} t0={T.offer.count[0]} t1={T.offer.count[1]} plus={c.offer.main.plus ? [...T.offer.plus] : undefined} /></p>
                <p className="fig-label halo"><Dn text={c.offer.main.label} t0={0.9} t1={1.7} /></p>
                <div className="fig-bar" aria-hidden="true">
                  <span className="track-bar"><i data-sx={T.offer.count.join(',')} /></span>
                  <span className="fig-step" data-step={T.offer.count.join(',')}>STEP 30/30</span>
                </div>
                {c.offer.extra.length > 0 && (
                  <div className="fig-extra">
                    {c.offer.extra.map((e, i) => (
                      <p key={i} className="fx-item" data-in={`${1 + i * 0.15},0.3,16`}>
                        <span className="fig-sm"><Count value={e.value} t0={T.offer.count[0]} t1={T.offer.count[1]} plus={e.plus ? [...T.offer.plus] : undefined} /></span>
                        <span className="fig-sm-l">{e.label}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 2. PIPELINE */}
          {has('pipeline') && (
            <section className="scene sc-pipe" data-scene="pipeline" aria-labelledby="h-pipe">
              <div className="sc-in">
                <div className="pipe-col">
                  <Cap text={c.pipeline.caption} id="h-pipe" />
                  <div className="term panel" data-in="0,0.5,30">
                    <div className="term-bar" aria-hidden="true"><i /><i /><i /><span>{brandSlug}/pipeline</span></div>
                    <p className="term-cmd"><Type text={`> run ./${brandSlug}/pipeline`} t0={0.4} t1={0.8} hold={0.2} /></p>
                    <ol className="pi-list">
                      {c.pipeline.items.map((t, k) => {
                        const p = pipelineItem(k);
                        return (
                          <li key={k} className="pi" data-pi={k} data-in={`${r2(p.t0)},0.25,10`}>
                            <span className="pi-num" aria-hidden="true">{pad2(k + 1)}</span>
                            <Type text={t} t0={p.t0} t1={p.typed} hold={0} className="pi-text" />
                            <span className="pi-prog deco" aria-hidden="true" />
                            <span className="pi-spin" aria-hidden="true" data-pulse-at={r2(p.ok)} />
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
                <div className="map" data-map="pipeline" aria-hidden="true" />
              </div>
            </section>
          )}

          {/* 3. FORMATS */}
          {has('formats') && (
            <section className="scene sc-fmt" data-scene="formats" aria-labelledby="h-fmt">
              <div className="sc-in">
                <div className="fmt-head shade">
                  <Cap text={c.formats.caption} id="h-fmt" />
                  <p className="fmt-title halo" data-in="0.2,0.4,16">
                    <span className="fh-n">{c.formats.items.length}</span> {plural(c.formats.items.length, ['формат', 'формата', 'форматов'])}
                    <span className="fmt-dot"> · </span>
                    <span className="fh-m">{c.formats.second.value}</span> {plural(c.formats.second.value, c.formats.second.words)}
                  </p>
                </div>
                <div className="map" data-map="formats" aria-hidden="true" />
                <div className="legend panel">
                  <table>
                    <tbody>
                      {c.formats.items.map((f, i) => {
                        const r0 = r2(F.first + i * F.every);
                        return (
                          <tr key={i} data-fr={i} data-in={`${r0},0.25,8`}>
                            <td className="tri" aria-hidden="true">▲</td>
                            <th scope="row" className="nm">{f.name}</th>
                            <td className="val"><Count value={f.value} t0={r0} t1={r2(r0 + F.count)} /></td>
                            <td className="bar" aria-hidden="true"><span style={{ '--w': f.value / fmax } as CSSProperties}><i data-sx={`${r0},${r2(r0 + F.count)}`} /></span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <a className="fmt-link" href={c.formats.link.href} data-track="formats_link" data-place="formats" data-in={`${fLink},0.8,12`}>
                  {c.formats.link.text} <span aria-hidden="true">→</span>
                </a>
              </div>
            </section>
          )}

          {/* 4. CASES */}
          {has('cases') && (
            <section className="scene sc-cases" data-scene="cases" aria-labelledby="h-cases">
              <div className="sc-in">
                <div className="cases-head"><Cap text={c.cases.caption} id="h-cases" /></div>
                <div className="map" data-map="cases" aria-hidden="true" />
                {c.cases.items.map((it, k) => {
                  const o = k * T.cases.card, n = c.cases.items.length;
                  return (
                    <article key={k} className="case-card panel" data-win={`${r2(o + T.cases.in[0])},${r2(o + T.cases.in[1])},${r2(o + T.cases.out[0])},${r2(o + T.cases.out[1])}`} data-from="28,0" data-from-t="0,28" data-to="-16,0" data-to-t="0,-16">
                      <span className="panel-strip" aria-hidden="true" />
                      <p className="case-idx" aria-hidden="true">▲ {pad2(k + 1)} / {pad2(n)}</p>
                      <h3 className="case-title fit">{it.title}</h3>
                      <Frame reveal={o + 0.45} img={it.image ? { ...it.image, src: asset(it.image.src), alt: `${it.image.alt} — изображение создано с помощью ИИ` } : undefined}>
                        [кадр из работы]
                      </Frame>
                      <p className="case-tags"><Dn text={it.tags} t0={o + T.cases.tags[0]} t1={o + T.cases.tags[1]} /></p>
                      <i className="case-line" aria-hidden="true" data-sx={`${r2(o + 0.6)},${r2(o + 1.0)}`} />
                      <p className="case-res"><Type text={it.result} t0={o + T.cases.typeAt} cps={sc('cases')?.p.cps ?? T.cases.cps} hold="inf" /></p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* 5. SHOWCASE */}
          {has('showcase') && (
            <section className="scene sc-show" data-scene="showcase" aria-labelledby="h-show">
              <div className="sc-in">
                <Cap text={c.showcase.caption} id="h-show" />
                <div className="shots">
                  {proof.map((p, i) => (
                    <div key={p.file} className="shot" data-in={`${r2(i * T.showcase.every)},0.4,20`}>
                      <Frame reveal={i * T.showcase.every} seed={p.seed} img={{ src: p.src, width: p.width, height: p.height, alt: `${c.showcase.alts[p.file] ?? 'Пример работы'} — изображение создано с помощью ИИ` }} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 6. HOW TO ORDER */}
          {has('order') && (
            <section className="scene sc-order" data-scene="order" aria-labelledby="h-order">
              <div className="sc-in">
                <Cap text={c.order.caption} id="h-order" />
                <div className="order-body">
                <ol className="steps">
                  {c.order.steps.map((s, k) => (
                    <li key={k} className="step panel" data-in={`${r2(0.2 + T.order.every * k)},0.3,24`}>
                      <span className="panel-strip" aria-hidden="true" />
                      <span className="step-n" aria-hidden="true">{pad2(k + 1)}</span>
                      <h3 className="step-t"><Dn text={s.title} t0={0.3 + T.order.every * k} t1={0.8 + T.order.every * k} /></h3>
                      <p className="step-p"><Type text={s.text} t0={0.5 + T.order.every * k} cps={T.order.cps} hold={0.4} /></p>
                    </li>
                  ))}
                </ol>
                <div className="order-cta" data-in={`${T.order.cta[0]},0.4,16`}>
                  <Cta place="order" />
                  <p className="micro">{c.cta.note}</p>
                </div>
                </div>
              </div>
            </section>
          )}

          {/* 7. FAQ */}
          {has('faq') && (
            <section className="scene sc-faq" data-scene="faq" aria-labelledby="h-faq">
              <div className="sc-in">
                <Cap text={c.faq.caption} id="h-faq" />
                <dl className="faq shade">
                  {c.faq.items.map((f, k) => (
                    <div key={k} className="qa" data-in={`${r2(0.2 + T.faq.every * k)},0.3,12`}>
                      <dt><Dn text={f.q} t0={0.2 + T.faq.every * k} t1={0.6 + T.faq.every * k} /></dt>
                      <dd><Type text={f.a} t0={0.5 + T.faq.every * k} cps={T.faq.cps} hold={0.3} /></dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          )}

          {/* 8. FINAL */}
          <section className="scene sc-final" data-scene="final" aria-labelledby="h-final">
            <div className="sc-in final-in">
              <h2 id="h-final" className="sr-only">{c.final.caption}</h2>
              <Wordmark draw={T.final.frame} glitchAt={0.1} />
              <p className="final-word halo" data-in={`${T.final.rest[0]},0.5,16`}><Dn text={c.final.word} t0={T.final.rest[0]} t1={T.final.rest[1]} /></p>
              <div className="final-cta" data-in={`${T.final.rest[0] + 0.1},0.4,16`}>
                <Cta place="final" />
                <p className="micro">{c.cta.note}</p>
                <a className="sec-link" href={c.secondary.href} data-track="secondary" data-place="final">{c.secondary.text} <span aria-hidden="true">→</span></a>
              </div>
            </div>
          </section>
        </div>

        {/* HUD-показания */}
        <div className="hud" aria-hidden="true">
          <div className="h-tl">
            <span className="h-scn">SCN 01/{pad2(tl.scenes.length)} · {c.hud.names.hero}</span>
            <span className="h-brand">{c.brand.name} · {c.brand.label}</span>
          </div>
          <div className="h-tr">
            <span className="h-tc">T+00:00.00 / --:--.--</span>
            <span className="h-bar"><i /></span>
          </div>
          <div className="h-bl"><span className="h-lat">LATENT X +0000.0  Y +0000.0  Z 1.00</span></div>
          <div className="h-br"><span className="h-seed">SEED 0000000 · STEP 00/30</span><span className="h-neu">NEURONS 000</span></div>
        </div>
        <nav className="topnav" aria-label="Разделы">
          {c.hud.nav.filter(n => has(n.id)).map(n => (
            <a key={n.id} href={`#${n.id}`} data-track="nav" data-place={n.id}>{n.text}</a>
          ))}
          <Cta place="nav" small />
        </nav>
        {c.demo && <div className="demo" aria-hidden="true">ДЕМО-КОНТЕНТ · ЗАМЕНИТЕ В src/lib/content.ts</div>}
        <div className="grain" aria-hidden="true" />
        <div className="mbar">
          <p className="mbar-fig"><b>{c.offer.main.value}{c.offer.main.plus ? '+' : ''}</b><span>{c.offer.main.label}</span></p>
          <Cta place="mbar" small />
        </div>
      </div>

      {/* дорожка прокрутки с якорями на точках отдыха */}
      <div className="track" style={{ height: `calc(${r2(tl.vhTotal + 100)} * 1vh)` }}>
        {tl.scenes.map(s => (
          <div key={s.id} id={s.id} className="anchor" style={{ top: `${r2(s.anchorVh)}vh` }} />
        ))}
      </div>
    </div>
  );
}
