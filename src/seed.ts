import { canvasToBlob, renderRetro, upscale } from './retro/pipeline';
import { getPalette } from './retro/palettes';
import { getStore } from './store';

/**
 * Seeds the local mock gallery with procedurally drawn night scenes run
 * through the real retro pipeline, so the archive feels inhabited on first
 * visit. Only ever runs against an empty local store.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise for ridgelines. */
function ridge(rand: () => number, n: number, roughness: number): number[] {
  const points = [rand(), rand(), rand(), rand(), rand(), rand()];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (points.length - 1);
    const i0 = Math.floor(t);
    const f = t - i0;
    const s = f * f * (3 - 2 * f);
    const v = points[i0] * (1 - s) + points[Math.min(i0 + 1, points.length - 1)] * s;
    out.push(v + (rand() - 0.5) * roughness);
  }
  return out;
}

function drawScene(seed: number, w: number, h: number): HTMLCanvasElement {
  const rand = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Night sky.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  const top = 8 + rand() * 24;
  sky.addColorStop(0, `rgb(${top} ${top + 4} ${top + 18})`);
  sky.addColorStop(1, `rgb(${top + 40} ${top + 46} ${top + 64})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Stars.
  ctx.fillStyle = 'rgba(235, 240, 250, 0.9)';
  const stars = 40 + rand() * 80;
  for (let i = 0; i < stars; i++) {
    const s = rand() < 0.15 ? 3 : 2;
    ctx.globalAlpha = 0.3 + rand() * 0.7;
    ctx.fillRect(rand() * w, rand() * h * 0.55, s, s);
  }
  ctx.globalAlpha = 1;

  // Moon with halo.
  const mx = w * (0.15 + rand() * 0.7);
  const my = h * (0.08 + rand() * 0.2);
  const mr = 14 + rand() * 26;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
  halo.addColorStop(0, 'rgba(220, 230, 245, 0.5)');
  halo.addColorStop(1, 'rgba(220, 230, 245, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  ctx.fillStyle = 'rgb(232 238 248)';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(150, 160, 180, 0.5)';
  ctx.beginPath();
  ctx.arc(mx - mr * 0.3, my + mr * 0.2, mr * 0.3, 0, Math.PI * 2);
  ctx.arc(mx + mr * 0.35, my - mr * 0.3, mr * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Layered ridges, far → near.
  const layers = 3 + Math.floor(rand() * 2);
  for (let l = 0; l < layers; l++) {
    const depth = l / (layers - 1);
    const base = h * (0.45 + depth * 0.4);
    const amp = h * (0.12 + rand() * 0.15);
    const line = ridge(rand, w, 0.02);
    const shade = 14 + (1 - depth) * 52;
    ctx.fillStyle = `rgb(${shade * 0.8} ${shade} ${shade * 0.95})`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, base - line[x] * amp);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Trees on the nearer ridges.
    if (depth > 0.4) {
      ctx.fillStyle = `rgb(${shade * 0.55} ${shade * 0.72} ${shade * 0.62})`;
      const count = 10 + rand() * 25;
      for (let i = 0; i < count; i++) {
        const x = rand() * w;
        const yTop = base - line[Math.floor(x)] * amp;
        const th = 14 + rand() * 30 * depth;
        const tw = th * 0.38;
        for (let tier = 0; tier < 3; tier++) {
          const ty = yTop - th + (th / 3) * tier;
          const half = (tw * (tier + 1.5)) / 3;
          ctx.beginPath();
          ctx.moveTo(x, ty);
          ctx.lineTo(x - half, ty + th / 2.4);
          ctx.lineTo(x + half, ty + th / 2.4);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // A lit window somewhere in the foothills, sometimes.
  if (rand() < 0.6) {
    const hx = w * (0.2 + rand() * 0.6);
    const hy = h * (0.68 + rand() * 0.18);
    ctx.fillStyle = 'rgb(16 18 24)';
    ctx.fillRect(hx - 16, hy - 14, 32, 14);
    ctx.beginPath();
    ctx.moveTo(hx - 20, hy - 14);
    ctx.lineTo(hx, hy - 26);
    ctx.lineTo(hx + 20, hy - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgb(240 220 130)';
    ctx.fillRect(hx - 8, hy - 11, 5, 6);
    ctx.fillRect(hx + 3, hy - 11, 5, 6);
  }

  return canvas;
}

const SEED_SPECS: { seed: number; paletteId: string; pixelSize: number }[] = [
  { seed: 11, paletteId: 'nocturne', pixelSize: 7 },
  { seed: 23, paletteId: 'valley', pixelSize: 6 },
  { seed: 37, paletteId: 'gameboy', pixelSize: 8 },
  { seed: 41, paletteId: 'moonsnow', pixelSize: 5 },
  { seed: 59, paletteId: 'glowworm', pixelSize: 7 },
  { seed: 67, paletteId: 'ember', pixelSize: 6 },
  { seed: 73, paletteId: 'valley', pixelSize: 9 },
  { seed: 89, paletteId: 'moonsnow', pixelSize: 7 },
];

let seeding: Promise<boolean> | undefined;

/** Idempotent across concurrent callers (React StrictMode runs effects twice). */
export function seedGalleryIfEmpty(): Promise<boolean> {
  seeding ??= doSeed();
  return seeding;
}

async function doSeed(): Promise<boolean> {
  const store = getStore();
  if (!(await store.isEmpty())) return false;

  for (const spec of SEED_SPECS) {
    const portrait = spec.seed % 3 === 0;
    const scene = drawScene(spec.seed, portrait ? 720 : 960, portrait ? 920 : 640);
    const bitmap = await createImageBitmap(scene);
    const small = renderRetro(bitmap, getPalette(spec.paletteId), {
      paletteId: spec.paletteId,
      pixelSize: spec.pixelSize,
      contrast: 16,
      dither: 0.85,
      ditherMode: spec.seed % 2 === 0 ? 'diffusion' : 'ordered',
    });
    const full = upscale(small, spec.pixelSize);
    const blob = await canvasToBlob(full);
    await store.add({
      blob,
      paletteId: spec.paletteId,
      width: full.width,
      height: full.height,
      moderationStatus: 'approved',
    });
  }
  return true;
}
