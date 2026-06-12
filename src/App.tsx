import { useEffect, useRef, useState } from 'react';
import { Studio } from './components/Studio';
import { Gallery } from './components/Gallery';
import { hashFor, navigate, registerNavHandler, type Route } from './nav';
import {
  fadeVeilAway,
  playGalleryToStudio,
  playStudioToGallery,
  prefersReducedMotion,
} from './transitions';

function routeFromHash(): Route {
  return window.location.hash === '#/gallery' ? 'gallery' : 'studio';
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const veilRef = useRef<HTMLDivElement>(null);
  const transitioning = useRef(false);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Once the destination view has mounted beneath the veil, lift it.
  useEffect(() => {
    fadeVeilAway(veilRef.current);
  }, [route]);

  useEffect(
    () =>
      registerNavHandler((to) => {
        if (transitioning.current || to === routeFromHash()) return;
        if (prefersReducedMotion()) {
          window.location.hash = hashFor(to);
          return;
        }
        transitioning.current = true;
        const play = to === 'gallery' ? playStudioToGallery : playGalleryToStudio;
        void play(veilRef.current!).then(() => {
          window.location.hash = hashFor(to);
          transitioning.current = false;
        });
      }),
    [],
  );

  const inGallery = route === 'gallery';

  return (
    <div className={`app ${inGallery ? 'app-inside' : ''}`}>
      {!inGallery && (
        <header className="masthead">
          <a
            className="wordmark"
            href="#/"
            aria-label="DITHER home"
            onClick={(e) => {
              e.preventDefault();
              navigate('studio');
            }}
          >
            DITHER
            <span className="wordmark-cursor" aria-hidden="true" />
          </a>
          <nav className="nav" aria-label="Primary">
            <a
              href="#/"
              className={route === 'studio' ? 'nav-link active' : 'nav-link'}
              onClick={(e) => {
                e.preventDefault();
                navigate('studio');
              }}
            >
              Studio
            </a>
            <a
              href="#/gallery"
              className="nav-link"
              onClick={(e) => {
                e.preventDefault();
                navigate('gallery');
              }}
            >
              Archive
            </a>
          </nav>
        </header>
      )}

      <main key={route} className="view" data-zoom-wrapper>
        {inGallery ? <Gallery /> : <Studio />}
      </main>

      {!inGallery && (
        <footer className="footer">
          <span>DITHER — a living archive of dithered light.</span>
          <span className="footer-dim">DT-1 TERMINAL · EST. 2026 · PROCESSED IN-BROWSER</span>
        </footer>
      )}

      <div ref={veilRef} className="transition-veil" aria-hidden="true" />
    </div>
  );
}
