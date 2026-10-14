/**
 * 4D simplex-шум (алгоритм Густавсона) и fBm на его основе.
 * Четвёртое измерение используется для бесшовного «дыхания»: (x, y, cos θ·R, sin θ·R).
 */

const F4 = (Math.sqrt(5) - 1) / 4;
const G4 = (5 - Math.sqrt(5)) / 20;

const GRAD4 = new Float32Array([
  0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1, -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1, -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0,
]);

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Noise4 = (x: number, y: number, z: number, w: number) => number;

export function createNoise4(seed = 1): Noise4 {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const r = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[r]; p[r] = t;
  }
  const perm = new Uint8Array(512);
  const permMod32x4 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod32x4[i] = (perm[i] % 32) * 4;
  }

  return (x, y, z, w) => {
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0, n4 = 0;
    const s = (x + y + z + w) * F4;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), l = Math.floor(w + s);
    const t = (i + j + k + l) * G4;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t), w0 = w - (l - t);

    let rx = 0, ry = 0, rz = 0, rw = 0;
    if (x0 > y0) rx++; else ry++;
    if (x0 > z0) rx++; else rz++;
    if (x0 > w0) rx++; else rw++;
    if (y0 > z0) ry++; else rz++;
    if (y0 > w0) ry++; else rw++;
    if (z0 > w0) rz++; else rw++;

    const i1 = rx >= 3 ? 1 : 0, j1 = ry >= 3 ? 1 : 0, k1 = rz >= 3 ? 1 : 0, l1 = rw >= 3 ? 1 : 0;
    const i2 = rx >= 2 ? 1 : 0, j2 = ry >= 2 ? 1 : 0, k2 = rz >= 2 ? 1 : 0, l2 = rw >= 2 ? 1 : 0;
    const i3 = rx >= 1 ? 1 : 0, j3 = ry >= 1 ? 1 : 0, k3 = rz >= 1 ? 1 : 0, l3 = rw >= 1 ? 1 : 0;

    const x1 = x0 - i1 + G4, y1 = y0 - j1 + G4, z1 = z0 - k1 + G4, w1 = w0 - l1 + G4;
    const x2 = x0 - i2 + 2 * G4, y2 = y0 - j2 + 2 * G4, z2 = z0 - k2 + 2 * G4, w2 = w0 - l2 + 2 * G4;
    const x3 = x0 - i3 + 3 * G4, y3 = y0 - j3 + 3 * G4, z3 = z0 - k3 + 3 * G4, w3 = w0 - l3 + 3 * G4;
    const x4 = x0 - 1 + 4 * G4, y4 = y0 - 1 + 4 * G4, z4 = z0 - 1 + 4 * G4, w4 = w0 - 1 + 4 * G4;

    const ii = i & 255, jj = j & 255, kk = k & 255, ll = l & 255;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if (t0 > 0) {
      const g = permMod32x4[ii + perm[jj + perm[kk + perm[ll]]]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD4[g] * x0 + GRAD4[g + 1] * y0 + GRAD4[g + 2] * z0 + GRAD4[g + 3] * w0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if (t1 > 0) {
      const g = permMod32x4[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD4[g] * x1 + GRAD4[g + 1] * y1 + GRAD4[g + 2] * z1 + GRAD4[g + 3] * w1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if (t2 > 0) {
      const g = permMod32x4[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD4[g] * x2 + GRAD4[g + 1] * y2 + GRAD4[g + 2] * z2 + GRAD4[g + 3] * w2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if (t3 > 0) {
      const g = permMod32x4[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]];
      t3 *= t3;
      n3 = t3 * t3 * (GRAD4[g] * x3 + GRAD4[g + 1] * y3 + GRAD4[g + 2] * z3 + GRAD4[g + 3] * w3);
    }
    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if (t4 > 0) {
      const g = permMod32x4[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]];
      t4 *= t4;
      n4 = t4 * t4 * (GRAD4[g] * x4 + GRAD4[g + 1] * y4 + GRAD4[g + 2] * z4 + GRAD4[g + 3] * w4);
    }
    return 27 * (n0 + n1 + n2 + n3 + n4);
  };
}

/** fBm, результат ≈ [-1, 1] */
export function fbm4(noise: Noise4, x: number, y: number, z: number, w: number, octaves: number, lac: number, gain: number) {
  let sum = 0, amp = 1, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f, z * f, w * f);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

/** целочисленный хеш → [0, 1), без Math.random */
export function hash2(a: number, b: number) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
