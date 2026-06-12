# DITHER

A dark, atmospheric web art project: a retro image-processing terminal (the DT-1). Feed it a
photograph (upload or camera), it returns a low-resolution, palette-quantized, dithered
artifact, and a shared public archive — entered by zooming *into* the machine's screen —
keeps every one ever saved.

All image processing happens **in the browser** (Canvas 2D): downscale → contrast →
palette quantization → ordered (Bayer 8×8) or Floyd–Steinberg dithering → nearest-neighbor
upscale. Only the processed result is ever stored — originals never leave the device.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

No environment variables are required for local development. Without Supabase credentials the
app uses an IndexedDB mock store (per-device persistence) and seeds the archive with
procedurally generated scenes on first visit.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/retro/pipeline.ts` | The image pipeline (downscale, contrast, quantize, dither, upscale) |
| `src/retro/palettes.ts` | The six curated palettes |
| `src/store/` | `GalleryStore` interface + IndexedDB mock + Supabase REST implementation |
| `src/moderation.ts` | Moderation integration point (mock auto-approves locally) |
| `src/seed.ts` | Procedural seed scenes for an empty local archive |
| `src/nav.ts` | Tiny pub/sub so any component can request a cinematic route change |
| `src/transitions.ts` | GSAP timelines: zoom-into-the-screen, CRT power-off, veil handling |
| `src/components/` | Studio (the DT-1 terminal), Gallery (the 3D archive), hardware (knobs/keys/LEDs), CameraModal, Lightbox, IdleScreen |
| `src/styles/` | base (room), machine (terminal), gallery (inside the machine) |

## Connecting Supabase (recommended backend)

Supabase is the simplest practical setup here: one storage bucket + one Postgres table +
row-level security, generous free tier, and Edge Functions for moderation.

1. Create a project at supabase.com, then a **public storage bucket** named `gallery`.
2. Create the table:

   ```sql
   create table gallery_items (
     id uuid primary key default gen_random_uuid(),
     image_path text not null,
     palette text not null,
     width int not null,
     height int not null,
     moderation_status text not null default 'pending'
       check (moderation_status in ('pending', 'approved', 'rejected')),
     created_at timestamptz not null default now()
   );

   alter table gallery_items enable row level security;

   -- The public can only ever read approved rows.
   create policy "read approved" on gallery_items
     for select using (moderation_status = 'approved');

   -- Anonymous inserts must arrive as 'pending' — nobody approves themselves.
   create policy "insert pending" on gallery_items
     for insert with check (moderation_status = 'pending');
   ```

3. Storage policies: allow anon `insert` into the `gallery` bucket; public read is fine
   because URLs are unguessable UUIDs and the table gates what the gallery displays.
4. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
   The app switches from the local store to Supabase automatically (`src/store/index.ts`).

The Supabase client (`src/store/supabase.ts`) is plain REST — no SDK dependency needed.

## Moderation

The contract is already wired: every save passes through `screenImage()`
(`src/moderation.ts`), and both stores only ever *display* rows whose
`moderation_status = 'approved'`. Unsafe images are therefore excluded from the public
gallery **by default** — a missing moderation verdict means the image stays invisible.

Recommended production setup, in order of preference:

1. **Server-side API screening (recommended).** A Supabase Edge Function (or database
   webhook) fires on each `gallery_items` insert, sends the stored image to a moderation
   API, and flips `moderation_status` to `approved`/`rejected`. Realistic API options:
   - **Sightengine** — purpose-built image moderation (nudity, gore, weapons, minors);
     simple REST; free tier ~500 ops/month.
   - **AWS Rekognition DetectModerationLabels** — robust label taxonomy, pay-per-image
     (~$1/1k images), good if you're already on AWS.
   - **Google Cloud Vision SafeSearch** — similar; first 1k units/month free.
   - **Hive Moderation** — strong accuracy, enterprise-leaning.
2. **Client-side pre-filter (optional, additive).** Run `nsfwjs` in the browser before
   upload to reject obvious cases early and save API calls. Never sufficient alone — the
   client is untrusted.
3. **Manual approval queue (zero-cost fallback).** Skip the API; rows simply stay
   `pending` until a human flips them in the Supabase table editor. Fine for low volume.

Note that this app uploads the *processed* (pixelated, dithered) image. Heavy pixelation
degrades classifier accuracy, so for stricter screening, send the original to the moderation
API at save time and discard it after the verdict.

Moderation API keys belong on the server (Edge Function secrets) — never in `VITE_*` vars.

## Limitations / follow-ups

- The local store is per-device; the "shared public archive" needs Supabase connected.
- The mock `screenImage()` auto-approves after a delay — swap before going public.
- Floyd–Steinberg runs on the main thread; fine at these resolutions, but a Web Worker
  would help if output sizes grow.
- No delete/report flow in the gallery yet (worth adding alongside real moderation).
