import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type RetroSettings,
  canvasToBlob,
  renderRetro,
  upscale,
} from '../retro/pipeline';
import { DEFAULT_PALETTE_ID, PALETTES, getPalette, paletteGradient } from '../retro/palettes';
import { getStore, isLocalStore } from '../store';
import { screenImage } from '../moderation';
import { navigate } from '../nav';
import { CameraModal } from './CameraModal';
import { IdleScreen } from './IdleScreen';
import { Fader, KeyGroup, Knob, Led, PushButton } from './hardware';

type SaveState =
  | { phase: 'idle' }
  | { phase: 'screening' }
  | { phase: 'saving' }
  | { phase: 'saved' }
  | { phase: 'error'; message: string };

export function Studio() {
  const [source, setSource] = useState<ImageBitmap | null>(null);
  const [settings, setSettings] = useState<RetroSettings>({
    paletteId: DEFAULT_PALETTE_ID,
    ...DEFAULT_SETTINGS,
  });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ phase: 'idle' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outSize, setOutSize] = useState<{ w: number; h: number } | null>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const smallRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptBlob = useCallback(async (blob: Blob) => {
    setLoadError(null);
    setSaveState({ phase: 'idle' });
    try {
      const bitmap = await createImageBitmap(blob);
      setSource((prev) => {
        prev?.close();
        return bitmap;
      });
    } catch {
      setLoadError('That file could not be read as an image. Try a JPG, PNG, or WebP.');
    }
  }, []);

  // Re-render the retro preview whenever the source or settings change.
  useEffect(() => {
    if (!source || !previewRef.current) return;
    const small = renderRetro(source, getPalette(settings.paletteId), settings);
    smallRef.current = small;
    const preview = previewRef.current;
    preview.width = small.width;
    preview.height = small.height;
    const ctx = preview.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0);
    setOutSize({ w: small.width, h: small.height });
  }, [source, settings]);

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setLoadError('That file is not an image. Try a JPG, PNG, or WebP.');
        return;
      }
      void acceptBlob(file);
    },
    [acceptBlob],
  );

  const buildFullSize = useCallback(async () => {
    const small = smallRef.current;
    if (!small) throw new Error('Nothing to export yet');
    const full = upscale(small, settings.pixelSize);
    return { full, blob: await canvasToBlob(full) };
  }, [settings.pixelSize]);

  const onDownload = useCallback(async () => {
    try {
      const { blob } = await buildFullSize();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dither-${settings.paletteId}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setSaveState({ phase: 'error', message: 'Could not export the image.' });
    }
  }, [buildFullSize, settings.paletteId]);

  const onSave = useCallback(async () => {
    try {
      setSaveState({ phase: 'screening' });
      const { full, blob } = await buildFullSize();
      const status = await screenImage(blob);
      if (status === 'rejected') {
        setSaveState({ phase: 'error', message: 'This image was declined by screening.' });
        return;
      }
      setSaveState({ phase: 'saving' });
      await getStore().add({
        blob,
        paletteId: settings.paletteId,
        width: full.width,
        height: full.height,
        moderationStatus: status,
      });
      setSaveState({ phase: 'saved' });
    } catch (err) {
      setSaveState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Saving failed.',
      });
    }
  }, [buildFullSize, settings.paletteId]);

  const busy = saveState.phase === 'screening' || saveState.phase === 'saving';
  const fault = saveState.phase === 'error' || loadError !== null;
  const palette = getPalette(settings.paletteId);

  return (
    <section className="studio">
      <div className="studio-intro">
        <h1 className="display">
          Feed a photograph to <em>the machine</em>.
        </h1>
        <p className="lede">
          DITHER takes your picture apart, pixel by pixel, and keeps the memory — small, dark,
          and permanent. Only the dithered result is ever archived.
        </p>
      </div>

      <div
        className={`bench ${dragging ? 'bench-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <div className="machine">
          <div className="machine-top">
            <span className="vents" aria-hidden="true" />
            <span className="machine-badge" aria-hidden="true">
              DITHER
            </span>
            <span className="machine-model">DT-1 IMAGE PROCESSOR</span>
          </div>

          <div className="machine-body">
            <div className="crt">
              <div className={`crt-glass ${source ? 'has-signal' : ''}`} data-zoom-target>
                <div className="osd" aria-hidden="true">
                  <span>{palette.name.toUpperCase()}</span>
                  <span>
                    {source && outSize ? `${outSize.w}×${outSize.h} PX` : 'AWAITING SIGNAL'}
                  </span>
                </div>

                {source ? (
                  <canvas ref={previewRef} className="crt-canvas" aria-label="Dithered preview" />
                ) : (
                  <IdleScreen
                    onLoadClick={() => fileRef.current?.click()}
                    onCameraClick={() => setCameraOpen(true)}
                  />
                )}

                <div className="crt-scanlines" aria-hidden="true" />
                <div className="crt-glare" aria-hidden="true" />
                <div className="crt-dropring" aria-hidden="true" />
              </div>

              <div className="crt-chin">
                <span className="machine-brand" aria-hidden="true">
                  D I T H E R
                </span>
                <span className="chin-right">
                  <Led on color="green" label="PWR" />
                </span>
              </div>
            </div>

            <aside className="panel" aria-label="Processing controls">
              <section className="panel-section">
                <span className="panel-label" id="palette-label">
                  Palette
                </span>
                <KeyGroup
                  label="Palette"
                  className="palette-keys"
                  value={settings.paletteId}
                  onChange={(paletteId) => setSettings((s) => ({ ...s, paletteId }))}
                  items={PALETTES.map((p) => ({
                    id: p.id,
                    title: p.name,
                    render: (
                      <>
                        <span
                          className="key-chip"
                          aria-hidden="true"
                          style={{ background: paletteGradient(p) }}
                        />
                        <span className="key-name">{p.name}</span>
                      </>
                    ),
                  }))}
                />
              </section>

              <div className="panel-divider" aria-hidden="true" />

              <section className="panel-section knobs-row">
                <Knob
                  label="Pixel"
                  min={2}
                  max={14}
                  step={1}
                  value={settings.pixelSize}
                  format={(v) => `${v}PX`}
                  onChange={(pixelSize) => setSettings((s) => ({ ...s, pixelSize }))}
                />
                <Knob
                  label="Contrast"
                  min={-60}
                  max={80}
                  step={2}
                  value={settings.contrast}
                  format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                  onChange={(contrast) => setSettings((s) => ({ ...s, contrast }))}
                />
              </section>

              <section className="panel-section">
                <Fader
                  label="Dither"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(settings.dither * 100)}
                  format={(v) => `${v}%`}
                  onChange={(v) => setSettings((s) => ({ ...s, dither: v / 100 }))}
                />
              </section>

              <section className="panel-section">
                <span className="panel-label">Texture</span>
                <KeyGroup
                  label="Dither mode"
                  className="rocker"
                  value={settings.ditherMode}
                  onChange={(ditherMode) => setSettings((s) => ({ ...s, ditherMode }))}
                  items={[
                    { id: 'ordered' as const, title: 'Halftone', render: 'HALFTONE' },
                    { id: 'diffusion' as const, title: 'Grain', render: 'GRAIN' },
                  ]}
                />
              </section>

              <div className="panel-divider" aria-hidden="true" />

              <section className="panel-section transport">
                <PushButton onClick={() => fileRef.current?.click()} ariaLabel="Load an image file">
                  LOAD
                </PushButton>
                <PushButton onClick={() => setCameraOpen(true)} ariaLabel="Open the camera">
                  CAMERA
                </PushButton>
                <PushButton
                  onClick={() => void onDownload()}
                  disabled={!source}
                  ariaLabel="Download the processed image"
                >
                  EXPORT
                </PushButton>
              </section>

              <PushButton
                variant="primary"
                className="pbtn-archive"
                onClick={() => void onSave()}
                disabled={!source || busy}
              >
                {saveState.phase === 'screening'
                  ? 'SCREENING…'
                  : saveState.phase === 'saving'
                    ? 'ARCHIVING…'
                    : 'SAVE TO ARCHIVE'}
              </PushButton>

              <section className="panel-section status-row">
                <div className="led-row" aria-hidden="true">
                  <Led on={!!source} color="green" label="SIG" />
                  <Led on={busy} blink color="amber" label="BUSY" />
                  <Led on={saveState.phase === 'saved'} color="green" label="SAVED" />
                  <Led on={fault} color="red" label="FAULT" />
                </div>
                <p className="panel-status" role="status">
                  {loadError ? (
                    <span className="status-error">{loadError}</span>
                  ) : saveState.phase === 'error' ? (
                    <span className="status-error">{saveState.message}</span>
                  ) : saveState.phase === 'screening' ? (
                    'Screening image…'
                  ) : saveState.phase === 'saving' ? (
                    'Writing to archive…'
                  ) : saveState.phase === 'saved' ? (
                    <span className="status-ok">
                      Archived.{' '}
                      <a
                        href="#/gallery"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate('gallery');
                        }}
                      >
                        Enter the archive →
                      </a>
                      {isLocalStore() && <span className="status-dim"> (stored on this device)</span>}
                    </span>
                  ) : source ? (
                    'Signal locked. Tune the controls, then archive.'
                  ) : (
                    'Awaiting input. Load a photograph to begin.'
                  )}
                </p>
              </section>
            </aside>
          </div>

          <div className="machine-base">
            <span className="machine-serial">
              DT-1 · PROCESSED IN-BROWSER · ORIGINALS NEVER LEAVE THIS DEVICE
            </span>
          </div>
        </div>
        <div className="bench-shadow" aria-hidden="true" />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onCapture={(blob) => {
            setCameraOpen(false);
            void acceptBlob(blob);
          }}
        />
      )}
    </section>
  );
}
