import gsap from 'gsap';

/**
 * Cinematic route transitions for DITHER.
 *
 * Studio → Gallery: the view dollies into the CRT glass until the screen
 * fills the viewport, then a dark "veil" completes the cut — the gallery
 * mounts beneath it and fades it away, so it reads as travelling *into*
 * the machine.
 *
 * Gallery → Studio: the archive space collapses like a CRT powering off,
 * the veil covers the cut, and the studio boots back up.
 *
 * Both paths are skipped entirely under prefers-reduced-motion (App just
 * sets the hash; each view has a near-instant entry in that mode).
 */

const VEIL_BG = '#040806';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function quickVeilIn(veil: HTMLElement): Promise<void> {
  gsap.killTweensOf(veil);
  await gsap.fromTo(
    veil,
    { display: 'block', opacity: 0, background: VEIL_BG },
    { opacity: 1, duration: 0.3, ease: 'power1.in' },
  );
}

export async function playStudioToGallery(veil: HTMLElement): Promise<void> {
  const wrapper = document.querySelector<HTMLElement>('[data-zoom-wrapper]');
  const glass = document.querySelector<HTMLElement>('[data-zoom-target]');
  if (!wrapper || !glass) return quickVeilIn(veil);

  const r = glass.getBoundingClientRect();
  const w = wrapper.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Enough scale for the glass to cover the viewport, with a little overshoot
  // so the bezel never peeks in at the edges.
  const scale = Math.max(vw / r.width, vh / r.height) * 1.08;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  document.documentElement.classList.add('is-zooming');
  gsap.killTweensOf([veil, wrapper]);

  const tl = gsap.timeline();
  tl.set(veil, { display: 'block', opacity: 0, background: VEIL_BG })
    .set(wrapper, {
      transformOrigin: `${cx - w.left}px ${cy - w.top}px`,
      willChange: 'transform',
    })
    .to(
      '.masthead, .footer, .studio-intro, .bench-shadow',
      { opacity: 0.08, duration: 0.5, ease: 'power1.out' },
      0,
    )
    .to(
      wrapper,
      { x: vw / 2 - cx, y: vh / 2 - cy, scale, duration: 1.2, ease: 'power3.inOut' },
      0.06,
    )
    .to(veil, { opacity: 1, duration: 0.34, ease: 'power1.in' }, 0.92);

  await tl;
  document.documentElement.classList.remove('is-zooming');
}

export async function playGalleryToStudio(veil: HTMLElement): Promise<void> {
  const space = document.querySelector<HTMLElement>('.space-cam');
  if (!space) return quickVeilIn(veil);

  gsap.killTweensOf(veil);
  const tl = gsap.timeline();
  tl.set(veil, { display: 'block', opacity: 0, background: VEIL_BG })
    .to(
      '.archive-hud, .hud-foot, .hud-rail, .archive-motes',
      { opacity: 0, duration: 0.3, ease: 'power1.out' },
      0,
    )
    .to(
      space,
      {
        scaleY: 0.004,
        scaleX: 1.05,
        filter: 'brightness(2.2)',
        transformOrigin: '50% 50%',
        duration: 0.55,
        ease: 'power3.in',
      },
      0.04,
    )
    .to(space, { opacity: 0, duration: 0.14 }, 0.56)
    .to(veil, { opacity: 1, duration: 0.26, ease: 'power1.in' }, 0.42);

  await tl;
}

/** Called by App once the destination route has mounted beneath the veil. */
export function fadeVeilAway(veil: HTMLElement | null): void {
  if (!veil) return;
  if (getComputedStyle(veil).display === 'none') return;
  gsap.killTweensOf(veil);
  gsap.to(veil, {
    opacity: 0,
    duration: 0.7,
    delay: 0.15,
    ease: 'power1.out',
    onComplete: () => gsap.set(veil, { display: 'none' }),
  });
}
