import { useEffect } from 'react';
import type { GalleryItem } from '../store';
import { getPalette } from '../retro/palettes';

export function Lightbox(props: { item: GalleryItem; onClose: () => void }) {
  const { item, onClose } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop lightbox" onClick={onClose} role="dialog" aria-label="Artifact detail">
      <figure className="lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <img src={item.imageUrl} alt={`Artifact in ${getPalette(item.paletteId).name}`} />
        <figcaption className="lightbox-caption">
          <span>
            {getPalette(item.paletteId).name.toUpperCase()} · {item.width}×{item.height}
          </span>
          <span className="lightbox-actions">
            <a className="btn btn-ghost btn-small" href={item.imageUrl} download={`dither-${item.id}.png`}>
              Download
            </a>
            <button className="btn btn-ghost btn-small" onClick={onClose}>
              Close
            </button>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
