import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { getStore, isLocalStore, type GalleryItem } from '../store';
import { getPalette } from '../retro/palettes';
import { seedGalleryIfEmpty } from '../seed';
import { navigate } from '../nav';
import { prefersReducedMotion } from '../transitions';
import { Lightbox } from './Lightbox';

type LoadState = 'loading' | 'ready' | 'error';

/** Distance between consecutive artifacts along the camera axis, in px. */
const SPACING = 240;
const CARD_WIDTHS = [252, 206, 282];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * The inside of the machine: artifacts hang in a slow helix around the
 * camera axis. Scroll, drag, or arrow keys travel the depth of the archive;
 * DOM-based 3D transforms keep every artifact a real, focusable element.
 */
export function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const motesRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLElement | null)[]>([]);
  const positions = useRef<{ x: number; y: number; z: number; ry: number }[]>([]);
  const cam = useRef({ cur: 0, target: 0, max: 0 });
  const selectedRef = useRef<GalleryItem | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isLocalStore()) await seedGalleryIfEmpty();
        const list = await getStore().list();
        if (!cancelled) {
          setItems(list);
          setState('ready');
        }
      } catch (err) {
        console.error('[dither] gallery load failed', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Helix layout ---- */

  const relayout = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const radius = clamp(Math.min(vw, vh) * 0.34, 150, 380);
    positions.current = items.map((_, i) => {
      const a = i * 1.05 + 0.7;
      return {
        x: Math.cos(a) * radius * 1.45,
        y: Math.sin(a) * radius * 0.6,
        z: -i * SPACING,
        ry: Math.cos(a) * -13,
      };
    });
    cam.current.max = Math.max(0, items.length - 1) * SPACING;
    cam.current.target = clamp(cam.current.target, 0, cam.current.max);
    positions.current.forEach((p, i) => {
      const el = cardsRef.current[i];
      if (el) {
        el.style.transform = `translate(-50%, -50%) translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(
          1,
        )}px, ${p.z}px) rotateY(${p.ry.toFixed(1)}deg)`;
      }
    });
  }, [items]);

  useLayoutEffect(() => {
    relayout();
    window.addEventListener('resize', relayout);
    return () => window.removeEventListener('resize', relayout);
  }, [relayout]);

  /* ---- Entry: glide in from deep inside the tube ---- */

  useEffect(() => {
    if (state !== 'ready' || items.length === 0) return;
    cam.current.target = 0;
    cam.current.cur = prefersReducedMotion() ? 0 : -760;
  }, [state, items.length]);

  /* ---- Camera ticker: lerp toward target, fade by depth ---- */

  useEffect(() => {
    const space = spaceRef.current;
    if (!space) return;
    const reduced = prefersReducedMotion();

    const apply = () => {
      const c = cam.current;
      space.style.transform = `translateZ(${c.cur.toFixed(2)}px)`;
      const ps = positions.current;
      for (let i = 0; i < ps.length; i++) {
        const el = cardsRef.current[i];
        if (!el) continue;
        const rel = c.cur + ps[i].z; // 0 at focus depth, >0 once passed
        let o: number;
        if (rel > 170) o = 0;
        else if (rel > 30) o = 1 - (rel - 30) / 140;
        else o = clamp(1 + rel / 2400, 0.05, 1);
        el.style.opacity = o.toFixed(3);
        el.style.pointerEvents = o < 0.3 ? 'none' : '';
      }
      const thumb = thumbRef.current;
      if (thumb) {
        const p = c.max > 0 ? clamp(c.cur / c.max, 0, 1) : 0;
        thumb.style.top = `${(p * 100).toFixed(2)}%`;
        thumb.style.transform = `translateY(-${(p * 100).toFixed(2)}%)`;
      }
    };

    const tick = (_time: number, deltaTime: number) => {
      const c = cam.current;
      const d = c.target - c.cur;
      if (Math.abs(d) < 0.05) return;
      c.cur += reduced ? d : d * Math.min(1, (deltaTime / 16.7) * 0.09);
      apply();
    };

    apply();
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [items]);

  /* ---- Travel input: wheel, drag, keyboard ---- */

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const setTarget = (v: number) => {
      const c = cam.current;
      c.target = clamp(v, -60, c.max + 60);
    };

    const onWheel = (e: WheelEvent) => {
      if (selectedRef.current) return;
      e.preventDefault();
      setTarget(cam.current.target + e.deltaY * 1.15);
    };

    let drag: { y: number; t: number } | null = null;
    let moved = false;
    const onPointerDown = (e: PointerEvent) => {
      if (selectedRef.current || e.button !== 0) return;
      drag = { y: e.clientY, t: cam.current.target };
      moved = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 8) moved = true;
      if (moved) setTarget(drag.t - dy * 2.2);
    };
    const onPointerUp = () => {
      drag = null;
    };
    const onClickCapture = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (selectedRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
      const c = cam.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        setTarget(c.target + SPACING);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setTarget(c.target - SPACING);
      } else if (e.key === 'Home') {
        setTarget(0);
      } else if (e.key === 'End') {
        setTarget(c.max);
      } else {
        return;
      }
      e.preventDefault();
    };

    // Focus or transforms must never scroll the fixed stage out of place.
    const onScroll = () => {
      root.scrollTop = 0;
      root.scrollLeft = 0;
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('scroll', onScroll);
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  /* ---- Dust motes drifting inside the tube ---- */

  useEffect(() => {
    const canvas = motesRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const motes = Array.from({ length: 90 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: 0.25 + Math.random() * 0.75,
      s: Math.random() < 0.2 ? 2 : 1,
      vx: -(0.02 + Math.random() * 0.05),
      vy: -(0.03 + Math.random() * 0.09),
    }));
    const reduced = prefersReducedMotion();
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        if (!reduced) {
          m.x += m.vx * m.z * 2;
          m.y += m.vy * m.z * 2;
          if (m.y < -4) {
            m.y = h + 4;
            m.x = Math.random() * w;
          }
          if (m.x < -4) m.x = w + 4;
        }
        ctx.globalAlpha = 0.1 + m.z * 0.26;
        ctx.fillStyle = '#9df5b2';
        ctx.fillRect(m.x, m.y, m.s, m.s);
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const travelTo = (i: number) => {
    cam.current.target = clamp(i * SPACING, 0, cam.current.max);
  };

  return (
    <section className="archive" ref={rootRef} aria-label="DITHER archive">
      <canvas ref={motesRef} className="archive-motes" aria-hidden="true" />
      <div className="archive-film" aria-hidden="true" />

      <header className="archive-hud">
        <div className="hud-left">
          <span className="hud-title">
            DITHER <span className="hud-dim">// ARCHIVE</span>
          </span>
          <span className="hud-sub">
            {state === 'ready'
              ? `${items.length} ARTIFACTS · SCREENED BEFORE DISPLAY${
                  isLocalStore() ? ' · THIS DEVICE' : ''
                }`
              : '· · ·'}
          </span>
        </div>
        <a
          className="hud-exit"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            navigate('studio');
          }}
        >
          ◂ EXIT TO STUDIO
        </a>
      </header>

      {state === 'loading' && (
        <p className="archive-state">
          DEVELOPING THE ARCHIVE<span className="blink">▮</span>
        </p>
      )}
      {state === 'error' && (
        <p className="archive-state archive-state-error">
          ARCHIVE UNREACHABLE — TRY RELOADING
        </p>
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="archive-state">
          THE ARCHIVE IS EMPTY.
          <br />
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              navigate('studio');
            }}
          >
            MAKE THE FIRST ARTIFACT →
          </a>
        </p>
      )}

      <div className="space-cam">
        <div className="space" ref={spaceRef}>
          {items.map((item, i) => {
            const paletteName = getPalette(item.paletteId).name;
            return (
              <figure
                key={item.id}
                className="card"
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                style={{ width: `min(${CARD_WIDTHS[i % 3]}px, 56vw)` }}
              >
                <button
                  className="card-btn"
                  onClick={() => setSelected(item)}
                  onFocus={() => travelTo(i)}
                  aria-label={`Inspect artifact in ${paletteName}, ${formatDate(item.createdAt)}`}
                >
                  <img src={item.imageUrl} alt={`Artifact in ${paletteName}`} loading="lazy" />
                </button>
                <figcaption className="card-cap">
                  <span>{paletteName.toUpperCase()}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      {state === 'ready' && items.length > 0 && (
        <>
          <div className="hud-foot">
            <span className="hud-hint">SCROLL · DRAG · ARROW KEYS TO TRAVEL — CLICK TO INSPECT</span>
          </div>
          <div className="hud-rail" aria-hidden="true">
            <div className="hud-thumb" ref={thumbRef} />
          </div>
        </>
      )}

      {selected && <Lightbox item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}
