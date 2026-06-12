import type { GalleryItem, GalleryStore, ModerationStatus, NewGalleryItem } from './types';

/**
 * Local mock backend: stores processed images as Blobs in IndexedDB so the
 * gallery survives reloads on this device. Swap for the Supabase store
 * (src/store/supabase.ts) once credentials exist — see README.
 */

// Kept under the original name so archives saved before the DITHER rebrand survive.
const DB_NAME = 'retro-gallery';
const STORE = 'items';

interface StoredItem {
  id: string;
  blob: Blob;
  paletteId: string;
  width: number;
  height: number;
  createdAt: string;
  moderationStatus: ModerationStatus;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class LocalGalleryStore implements GalleryStore {
  private urls = new Map<string, string>();

  private toItem(s: StoredItem): GalleryItem {
    let url = this.urls.get(s.id);
    if (!url) {
      url = URL.createObjectURL(s.blob);
      this.urls.set(s.id, url);
    }
    return {
      id: s.id,
      imageUrl: url,
      paletteId: s.paletteId,
      width: s.width,
      height: s.height,
      createdAt: s.createdAt,
      moderationStatus: s.moderationStatus,
    };
  }

  async list(): Promise<GalleryItem[]> {
    const db = await openDb();
    const all = await tx<StoredItem[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<StoredItem[]>);
    db.close();
    return all
      .filter((s) => s.moderationStatus === 'approved')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => this.toItem(s));
  }

  async add(item: NewGalleryItem): Promise<GalleryItem> {
    const stored: StoredItem = {
      id: crypto.randomUUID(),
      blob: item.blob,
      paletteId: item.paletteId,
      width: item.width,
      height: item.height,
      createdAt: new Date().toISOString(),
      moderationStatus: item.moderationStatus,
    };
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.put(stored));
    db.close();
    return this.toItem(stored);
  }

  async isEmpty(): Promise<boolean> {
    const db = await openDb();
    const count = await tx<number>(db, 'readonly', (s) => s.count());
    db.close();
    return count === 0;
  }
}
