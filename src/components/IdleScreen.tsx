import { useEffect, useRef } from 'react';

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * The idle CRT: a slowly drifting dithered moonrise rendered live, so the
 * first thing a visitor sees is the machine already dreaming. Shown inside
 * the glass whenever no image is loaded.
 */
export function IdleScreen(props: { onLoadClick: () => void; onCameraClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const W = 128;
    const H = 96;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(W, H);
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 90) return; // ~11 fps — deliberate, sleepy cadence
      last = t;
      const time = t / 9000;
      const mx = W * (0.5 + 0.32 * Math.cos(time));
      const my = H * (0.42 + 0.18 * Math.sin(time * 1.7));
      const d = image.data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - mx;
          const dy = (y - my) * 1.4;
          const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 46);
          const horizon = Math.max(0, (y / H - 0.72) * 2.2);
          let v = glow * glow * 0.9 + horizon * 0.35;
          v += (BAYER_4[y & 3][x & 3] / 16 - 0.5) * 0.22;
          const on = v > 0.42;
          const i = (y * W + x) * 4;
          d[i] = on ? 186 : 6;
          d[i + 1] = on ? 235 : 14;
          d[i + 2] = on ? 196 : 10;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="idle">
      <canvas ref={ref} className="idle-canvas" aria-hidden="true" />
      <div className="idle-overlay">
        <p className="idle-title" aria-hidden="true">
          NO SIGNAL
        </p>
        <p className="idle-hint">DROP A PHOTOGRAPH ANYWHERE ON THE MACHINE</p>
        <div className="idle-actions">
          <button className="screen-btn" onClick={props.onLoadClick}>
            ▸ LOAD IMAGE
          </button>
          <button className="screen-btn" onClick={props.onCameraClick}>
            ▸ USE CAMERA
          </button>
        </div>
      </div>
    </div>
  );
}
