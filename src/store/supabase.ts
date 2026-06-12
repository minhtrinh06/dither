import type { GalleryItem, GalleryStore, NewGalleryItem } from './types';

/**
 * Supabase backend over plain REST (no SDK dependency needed for this scope).
 *
 * Required setup — see README "Connecting Supabase":
 *  - a public storage bucket named `gallery`
 *  - a table `gallery_items` (id uuid pk, image_path text, palette text,
 *    width int, height int, moderation_status text, created_at timestamptz)
 *  - RLS: anon may SELECT rows where moderation_status = 'approved',
 *    and INSERT rows only with moderation_status = 'pending'.
 *
 * Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

const TABLE = 'gallery_items';
const BUCKET = 'gallery';

interface Row {
  id: string;
  image_path: string;
  palette: string;
  width: number;
  height: number;
  moderation_status: GalleryItem['moderationStatus'];
  created_at: string;
}

export class SupabaseGalleryStore implements GalleryStore {
  private url: string;
  private anonKey: string;

  constructor(url: string, anonKey: string) {
    this.url = url;
    this.anonKey = anonKey;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}`, ...extra };
  }

  private publicUrl(path: string): string {
    return `${this.url}/storage/v1/object/public/${BUCKET}/${path}`;
  }

  private toItem(row: Row): GalleryItem {
    return {
      id: row.id,
      imageUrl: this.publicUrl(row.image_path),
      paletteId: row.palette,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      moderationStatus: row.moderation_status,
    };
  }

  async list(): Promise<GalleryItem[]> {
    const res = await fetch(
      `${this.url}/rest/v1/${TABLE}?moderation_status=eq.approved&order=created_at.desc&limit=200`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Gallery fetch failed (${res.status})`);
    const rows: Row[] = await res.json();
    return rows.map((r) => this.toItem(r));
  }

  async add(item: NewGalleryItem): Promise<GalleryItem> {
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.png`;

    const upload = await fetch(`${this.url}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'image/png' }),
      body: item.blob,
    });
    if (!upload.ok) throw new Error(`Image upload failed (${upload.status})`);

    const insert = await fetch(`${this.url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({
        image_path: path,
        palette: item.paletteId,
        width: item.width,
        height: item.height,
        // Server-side moderation (edge function / webhook) flips this to
        // 'approved'; the client never gets to approve its own upload.
        moderation_status: 'pending',
      }),
    });
    if (!insert.ok) throw new Error(`Gallery insert failed (${insert.status})`);
    const [row]: Row[] = await insert.json();
    return this.toItem(row);
  }

  async isEmpty(): Promise<boolean> {
    return (await this.list()).length === 0;
  }
}
