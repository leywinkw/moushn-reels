import type { NextConfig } from 'next';

/**
 * STATIC_EXPORT=1 — статическая сборка в out/ (GitHub Pages).
 * NEXT_PUBLIC_BASE_PATH — подпуть сайта, например /moushn-reels. Локально оба пустые.
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(process.env.STATIC_EXPORT ? { output: 'export' as const, images: { unoptimized: true } } : {}),
  ...(base ? { basePath: base } : {}),
};

export default nextConfig;
