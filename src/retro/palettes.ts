export interface Palette {
  id: string;
  name: string;
  /** Colors ordered dark → light. */
  colors: [number, number, number][];
}

const hex = (s: string): [number, number, number] => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

export const PALETTES: Palette[] = [
  {
    id: 'nocturne',
    name: 'Nocturne',
    colors: ['#101620', '#dfeedd'].map(hex) as Palette['colors'],
  },
  {
    id: 'gameboy',
    name: 'Pea Soup',
    colors: ['#0f1a0f', '#2d4a2d', '#5a7d4a', '#9bbc6f', '#d8e8c4'].map(hex) as Palette['colors'],
  },
  {
    id: 'valley',
    name: 'Valley Dusk',
    colors: ['#23243a', '#3a4150', '#4a5446', '#6e7a6a', '#9aa1a8', '#c8d4e0', '#e8eef2'].map(
      hex,
    ) as Palette['colors'],
  },
  {
    id: 'glowworm',
    name: 'Glowworm',
    colors: ['#1c1c30', '#4a4420', '#6b6224', '#2e7d5b', '#52b788', '#e0e6f0'].map(
      hex,
    ) as Palette['colors'],
  },
  {
    id: 'moonsnow',
    name: 'Moon & Snow',
    colors: ['#08080c', '#23262e', '#454a58', '#6e7585', '#9aa3b5', '#c5cdda', '#eef1f6'].map(
      hex,
    ) as Palette['colors'],
  },
  {
    id: 'ember',
    name: 'Ember Terminal',
    colors: ['#140d08', '#4a2812', '#9c4a1a', '#e07b2a', '#f5c179'].map(hex) as Palette['colors'],
  },
];

export const DEFAULT_PALETTE_ID = 'valley';

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Hard-stop gradient previewing the palette, dark → light. */
export function paletteGradient(p: Palette): string {
  const n = p.colors.length;
  const stops = p.colors
    .map(([r, g, b], i) => `rgb(${r} ${g} ${b}) ${(i / n) * 100}% ${((i + 1) / n) * 100}%`)
    .join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
