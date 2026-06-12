import type { Palette } from './palettes';

export interface RetroSettings {
  paletteId: string;
  /** Size of one output pixel in screen pixels (2–14). */
  pixelSize: number;
  /** Contrast, -100..100. 0 is neutral. */
  contrast: number;
  /** Dither strength, 0..1. */
  dither: number;
  ditherMode: 'ordered' | 'diffusion';
}

export const DEFAULT_SETTINGS: Omit<RetroSettings, 'paletteId'> = {
  pixelSize: 6,
  contrast: 18,
  dither: 0.85,
  ditherMode: 'ordered',
};

/** Longest edge of the full-size output, in screen pixels. */
const OUTPUT_MAX_EDGE = 1080;

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export async function loadBitmap(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function nearestColor(palette: Palette['colors'], r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    // Perceptual-ish weighting keeps skies and skin from collapsing into one band.
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Renders `bitmap` into a low-resolution, palette-quantized, dithered canvas.
 * The returned canvas is the *small* version — one canvas pixel per retro pixel.
 */
export function renderRetro(
  bitmap: ImageBitmap,
  palette: Palette,
  settings: RetroSettings,
): HTMLCanvasElement {
  const { pixelSize, contrast, dither, ditherMode } = settings;
  const scale = Math.min(1, OUTPUT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const smallW = Math.max(8, Math.round((bitmap.width * scale) / pixelSize));
  const smallH = Math.max(8, Math.round((bitmap.height * scale) / pixelSize));

  const small = document.createElement('canvas');
  small.width = smallW;
  small.height = smallH;
  const ctx = small.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, smallW, smallH);

  const image = ctx.getImageData(0, 0, smallW, smallH);
  const data = image.data;
  const colors = palette.colors;

  // Standard contrast curve around mid-grey.
  const c = (contrast / 100) * 255;
  const cf = (259 * (c + 255)) / (255 * (259 - c));

  // Working copy in floats so diffusion error survives between pixels.
  const buf = new Float32Array(smallW * smallH * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    buf[j] = clamp255(cf * (data[i] - 128) + 128);
    buf[j + 1] = clamp255(cf * (data[i + 1] - 128) + 128);
    buf[j + 2] = clamp255(cf * (data[i + 2] - 128) + 128);
  }

  // Threshold amplitude scales with how few colors the palette has.
  const span = 255 / Math.max(2, colors.length - 1);

  for (let y = 0; y < smallH; y++) {
    for (let x = 0; x < smallW; x++) {
      const j = (y * smallW + x) * 3;
      let r = buf[j];
      let g = buf[j + 1];
      let b = buf[j + 2];

      if (ditherMode === 'ordered' && dither > 0) {
        const t = (BAYER_8[y & 7][x & 7] / 64 - 0.5) * span * dither;
        r = clamp255(r + t);
        g = clamp255(g + t);
        b = clamp255(b + t);
      }

      const idx = nearestColor(colors, r, g, b);
      const [pr, pg, pb] = colors[idx];

      if (ditherMode === 'diffusion' && dither > 0) {
        const er = (r - pr) * dither;
        const eg = (g - pg) * dither;
        const eb = (b - pb) * dither;
        // Floyd–Steinberg kernel.
        if (x + 1 < smallW) {
          const k = j + 3;
          buf[k] += er * (7 / 16);
          buf[k + 1] += eg * (7 / 16);
          buf[k + 2] += eb * (7 / 16);
        }
        if (y + 1 < smallH) {
          if (x > 0) {
            const k = j + (smallW - 1) * 3;
            buf[k] += er * (3 / 16);
            buf[k + 1] += eg * (3 / 16);
            buf[k + 2] += eb * (3 / 16);
          }
          const k = j + smallW * 3;
          buf[k] += er * (5 / 16);
          buf[k + 1] += eg * (5 / 16);
          buf[k + 2] += eb * (5 / 16);
          if (x + 1 < smallW) {
            const k2 = j + (smallW + 1) * 3;
            buf[k2] += er * (1 / 16);
            buf[k2 + 1] += eg * (1 / 16);
            buf[k2 + 2] += eb * (1 / 16);
          }
        }
      }

      const o = (y * smallW + x) * 4;
      data[o] = pr;
      data[o + 1] = pg;
      data[o + 2] = pb;
      data[o + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return small;
}

/** Upscales the small canvas to full output size with hard pixel edges. */
export function upscale(small: HTMLCanvasElement, pixelSize: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = small.width * pixelSize;
  out.height = small.height * pixelSize;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/png',
    );
  });
}
