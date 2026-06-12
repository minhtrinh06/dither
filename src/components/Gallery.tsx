import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { getStore, isLocalStore, type GalleryItem } from '../store';
import { getPalette } from '../retro/palettes';
import { seedGalleryIfEmpty } from '../seed';
import { navigate } from '../nav';
import { prefersReducedMotion } from '../transitions';
import { Lightbox } from './Lightbox';

type LoadState = 'loading' | 'ready' | 'error';

/** Card slots circulating through the helix; each one is recycled forever. */
const MAX_SLOTS = 12;
/** Loop length must reach past the far fade (-2400px) so recycling happens unseen. */
const LOOP_DEPTH = 2880;
const MIN_SPACING = 240;
/** Drift toward the viewer, px per second. */
const DRIFT_SPEED = 80;
/** A card is safely invisible this far behind the focus plane and may wrap. */
const EXIT_DEPTH = 200;
const CARD_WIDTHS = [252, 206, 282];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The inside of the machine: artifacts drift toward you in a slow, endless
 * helix. Slots that pass the camera rejoin the far end with a freshly drawn
 * artifact (shuffled-deck random, so the stream never repeats its order).
 * Hovering or focusing a card eases the drift to a hold; under
 * prefers-reduced-motion the stream only moves on scroll/arrow keys.
 */
export function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  /** slotItems[j] = index into `items` currently shown by slot j. */
  const [slotItems, setSlotItems] = useState<number[]>([]);
  const [reduced] = useState(prefersReducedMotion);

  const rootRef = useRef<HTMLElement>(null);
  const motesRef = useRef<HTMLCanvasElement>(null);
  const cardsRef = useRef<(HTMLElement | null)[]>([]);
  /** Per-slot distance along the spiral path; 0 = focus plane, larger = deeper. */
  const slotP = useRef<number[]>([]);
  const spacingRef = useRef(MIN_SPACING);
  const radiusRef = useRef(300);
  const countRef = useRef(0);
  const deck = useRef({ order: [] as number[], pos: 0, last: -1 });
  /** Eased speed multiplier (0 while held, 1 adrift). */
  const factorRef = useRef(0);
  /** Entry surge: starts high so the archive rushes in, decays to 1. */
  const boostRef = useRef(1);
  const holdRef = useRef({ hover: false, focus: false, modal: false });
  const selectedRef = useRef<GalleryItem | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
    holdRef.current.modal = selected !== null;
  }, [selected]);

  /* ---- Shuffled deck: every artifact appears before any repeats, never twice in a row ---- */

  const drawItem = useCallback((count: number) => {
    const d = deck.current;
    if (d.pos >= d.order.length) {
      d.order = shuffled(count);
      d.pos = 0;
      if (count > 1 && d.order[0] === d.last) {
        const k = 1 + Math.floor(Math.random() * (count - 1));
        [d.order[0], d.order[k]] = [d.order[k], d.order[0]];
      }
    }
    d.last = d.order[d.pos++];
    return d.last;
  }, []);

  /** Builds the circulating slot ring for a freshly loaded archive. */
  const initSlots = useCallback(
    (list: GalleryItem[]) => {
      const n = list.length;
      countRef.current = n;
      if (n === 0) {
        slotP.current = [];
        setSlotItems([]);
        return;
      }
      const slotCount = clamp(n * 2, 4, MAX_SLOTS);
      const spacing = Math.max(MIN_SPACING, Math.round(LOOP_DEPTH / slotCount));
      spacingRef.current = spacing;
      deck.current = { order: [], pos: 0, last: -1 };
      // Fixed per-slot jitter keeps the rhythm organic without drifting apart.
      slotP.current = Array.from(
        { length: slotCount },
        (_, j) => j * spacing + (Math.random() - 0.5) * spacing * 0.3,
      );
      cardsRef.current.length = slotCount;
      factorRef.current = 0;
      boostRef.current = reduced ? 1 : 5;
      setSlotItems(Array.from({ length: slotCount }, () => drawItem(n)));
    },
    [reduced, drawItem],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isLocalStore()) await seedGalleryIfEmpty();
        const list = await getStore().list();
        if (!cancelled) {
          setItems(list);
          initSlots(list);
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
  }, [initSlots]);

  /* ---- Imperative styling of every slot from its path position ---- */

  const apply = useCallback(() => {
    const ps = slotP.current;
    const spacing = spacingRef.current;
    const R = radiusRef.current;
    for (let j = 0; j < ps.length; j++) {
      const el = cardsRef.current[j];
      if (!el) continue;
      const p = ps[j];
      const a = (p / spacing) * 1.05 + 0.7;
      const x = Math.cos(a) * R * 1.45;
      const y = Math.sin(a) * R * 0.6;
      const ry = Math.cos(a) * -13;
      const rel = -p; // 0 at the focus plane, positive once a card passes the camera
      let o: number;
      if (rel > 170) o = 0;
      else if (rel > 30) o = 1 - (rel - 30) / 140;
      else o = clamp(1 + rel / 2400, 0, 1);
      el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(
        1,
      )}px, ${(-p).toFixed(1)}px) rotateY(${ry.toFixed(1)}deg)`;
      el.style.opacity = o.toFixed(3);
      el.style.pointerEvents = o < 0.3 ? 'none' : '';
    }
  }, []);

  /** Moves the whole stream by `dist` px, wrapping and re-rolling exhausted slots. */
  const advance = useCallback(
    (dist: number) => {
      const ps = slotP.current;
      if (ps.length === 0) return;
      const loop = ps.length * spacingRef.current;
      let recycled: number[] | null = null;
      for (let j = 0; j < ps.length; j++) {
        ps[j] -= dist;
        if (ps[j] < -EXIT_DEPTH) {
          ps[j] += loop;
          (recycled ??= []).push(j);
        } else if (ps[j] > loop - EXIT_DEPTH) {
          ps[j] -= loop;
          (recycled ??= []).push(j);
        }
      }
      apply();
      if (recycled) {
        const wrapped = recycled;
        setSlotItems((prev) => {
          const next = [...prev];
          for (const j of wrapped) next[j] = drawItem(countRef.current);
          return next;
        });
      }
    },
    [apply, drawItem],
  );

  // Position freshly (re)rendered slots — also the only styling pass reduced motion gets.
  useEffect(() => {
    apply();
  }, [slotItems, apply]);

  /* ---- The drift ---- */

  useEffect(() => {
    if (reduced) return;
    const tick = (_time: number, deltaTime: number) => {
      const dt = Math.min(deltaTime, 100) / 1000; // clamp tab-restore jumps
      const hold = holdRef.current;
      const target = hold.modal || hold.focus || hold.hover ? 0 : 1;
      factorRef.current += (target - factorRef.current) * Math.min(1, dt * 6);
      boostRef.current += (1 - boostRef.current) * Math.min(1, dt * 1.6);
      const v = DRIFT_SPEED * factorRef.current * boostRef.current;
      if (v > 0.5) advance(v * dt);
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [reduced, advance]);

  /* ---- Reduced motion: the stream moves only on request ---- */

  useEffect(() => {
    if (!reduced) return;
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (selectedRef.current) return;
      e.preventDefault();
      advance(e.deltaY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (selectedRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        advance(spacingRef.current);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        advance(-spacingRef.current);
      } else {
        return;
      }
      e.preventDefault();
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [reduced, advance]);

  /* ---- Hold-to-inspect: pointer or keyboard focus on a card stills the stream ---- */

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hold = holdRef.current;
    const isCard = (t: EventTarget | null) =>
      t instanceof Element && t.closest('.card-btn') !== null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && isCard(e.target)) hold.hover = true;
    };
    const onOut = (e: PointerEvent) => {
      if (hold.hover && !isCard(e.relatedTarget)) hold.hover = false;
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isCard(e.target)) hold.focus = true;
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isCard(e.relatedTarget)) hold.focus = false;
    };
    // Focus or transforms must never scroll the fixed stage out of place.
    const onScroll = () => {
      root.scrollTop = 0;
      root.scrollLeft = 0;
    };
    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('scroll', onScroll);
    return () => {
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('scroll', onScroll);
    };
  }, []);

  /* ---- Spiral radius tracks the viewport ---- */

  useEffect(() => {
    const relayout = () => {
      radiusRef.current = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.34, 150, 380);
      apply();
    };
    relayout();
    window.addEventListener('resize', relayout);
    return () => window.removeEventListener('resize', relayout);
  }, [apply]);

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
  }, [reduced]);

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
        <div className="space">
          {slotItems.map((itemIdx, j) => {
            const item = items[itemIdx];
            if (!item) return null;
            const paletteName = getPalette(item.paletteId).name;
            return (
              <figure
                key={j}
                className="card"
                ref={(el) => {
                  cardsRef.current[j] = el;
                }}
                style={{ width: `min(${CARD_WIDTHS[j % 3]}px, 56vw)` }}
              >
                <button
                  className="card-btn"
                  onClick={() => setSelected(item)}
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
        <div className="hud-foot">
          <span className="hud-hint">
            {reduced
              ? 'SCROLL OR ARROW KEYS TO TRAVEL — CLICK TO INSPECT'
              : 'THE ARCHIVE DRIFTS PAST — HOVER TO HOLD · CLICK TO INSPECT'}
          </span>
        </div>
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
