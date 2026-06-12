export type Route = 'studio' | 'gallery';

type Handler = (to: Route) => void;

let handler: Handler | null = null;

export function hashFor(to: Route): string {
  return to === 'gallery' ? '#/gallery' : '#/';
}

/** App registers the cinematic transition handler; returns an unregister fn. */
export function registerNavHandler(h: Handler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/**
 * Route change request from anywhere in the app. Goes through the registered
 * transition handler when one exists, otherwise falls back to a plain hash set.
 */
export function navigate(to: Route): void {
  if (handler) handler(to);
  else window.location.hash = hashFor(to);
}
