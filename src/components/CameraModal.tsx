import { useCallback, useEffect, useRef, useState } from 'react';

type CameraState = 'starting' | 'live' | 'denied' | 'unavailable';

export function CameraModal(props: { onClose: () => void; onCapture: (blob: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>(() =>
    typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'starting' : 'unavailable',
  );
  const [slow, setSlow] = useState(false);

  // If the permission prompt lingers (or the browser silently stalls),
  // reassure the user that upload remains available.
  useEffect(() => {
    if (state !== 'starting') return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setState('live');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setState(name === 'NotAllowedError' ? 'denied' : 'unavailable');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) props.onCapture(blob);
    }, 'image/png');
  }, [props]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <div className="modal-backdrop" onClick={props.onClose} role="dialog" aria-label="Camera">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="control-label">Camera</span>
          <button className="btn btn-ghost btn-small" onClick={props.onClose}>
            Close
          </button>
        </div>

        {state === 'starting' && (
          <p className="modal-message">
            Requesting camera… {slow && 'Check for a browser permission prompt — or close this and upload a photo instead.'}
          </p>
        )}

        {state === 'denied' && (
          <p className="modal-message">
            Camera permission was denied. You can re-enable it in your browser's site settings, or
            simply upload a photo instead.
          </p>
        )}

        {state === 'unavailable' && (
          <p className="modal-message">
            No camera is available in this browser. Uploading a photo works just as well.
          </p>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video"
          style={{ display: state === 'live' ? 'block' : 'none' }}
        />

        {state === 'live' && (
          <button className="btn btn-solid camera-shutter" onClick={capture}>
            Capture
          </button>
        )}
      </div>
    </div>
  );
}
