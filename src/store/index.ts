import { LocalGalleryStore } from './local';
import { SupabaseGalleryStore } from './supabase';
import type { GalleryStore } from './types';

export * from './types';

let store: GalleryStore | undefined;

export function getStore(): GalleryStore {
  if (!store) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && key) {
      store = new SupabaseGalleryStore(url, key);
    } else {
      console.info('[dither] No Supabase env vars — using local IndexedDB store.');
      store = new LocalGalleryStore();
    }
  }
  return store;
}

export function isLocalStore(): boolean {
  return getStore() instanceof LocalGalleryStore;
}
