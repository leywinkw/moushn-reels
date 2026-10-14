import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asset } from './config';
import { seedOf } from './timeline';

export type Proof = { src: string; file: string; width: number; height: number; seed: number };

/** Размеры из заголовка WebP: VP8 (lossy), VP8L (lossless), VP8X (extended/анимация) */
function webpSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  return null;
}

/** Файлы public/proof/*.webp — читаются при сборке (страница пререндерится статически) */
export function readProof(): Proof[] {
  const dir = join(process.cwd(), 'public', 'proof');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.webp')).sort();
  } catch {
    return [];
  }
  return files.slice(0, 3).flatMap(file => {
    const size = webpSize(readFileSync(join(dir, file)));
    return size ? [{ src: asset(`/proof/${file}`), file, ...size, seed: seedOf(file) }] : [];
  });
}
