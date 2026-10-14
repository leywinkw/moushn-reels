import Experience from '@/components/Experience';
import { content } from '@/lib/content';
import { readProof } from '@/lib/proof';
import { buildTimeline } from '@/lib/timeline';
import { mono } from './fonts';

export const dynamic = 'force-static';

export default function Page() {
  const c = content;
  const proof = readProof();
  const tl = buildTimeline({
    pipeline: c.pipeline.items.length,
    formats: c.formats.items.length,
    cases: c.cases.items.length,
    casesMaxLen: Math.max(0, ...c.cases.items.map(i => i.result.length)),
    showcase: proof.length,
    order: c.order.steps.length,
    orderMaxLen: Math.max(0, ...c.order.steps.map(s => s.text.length)),
    faq: c.faq.items.filter(f => f.q && f.a).length,
    faqMaxLen: Math.max(0, ...c.faq.items.map(f => f.a.length)),
  });
  return <Experience tl={tl} proof={proof} monoFamily={mono.style.fontFamily} />;
}
