export type ModerationStatus = 'approved' | 'pending' | 'rejected';

export interface GalleryItem {
  id: string;
  /** Resolvable URL of the processed image (object URL locally, public URL remotely). */
  imageUrl: string;
  paletteId: string;
  width: number;
  height: number;
  createdAt: string;
  moderationStatus: ModerationStatus;
}

export interface NewGalleryItem {
  blob: Blob;
  paletteId: string;
  width: number;
  height: number;
  moderationStatus: ModerationStatus;
}

export interface GalleryStore {
  /** Returns approved items, newest first. */
  list(): Promise<GalleryItem[]>;
  add(item: NewGalleryItem): Promise<GalleryItem>;
  /** True if the store has never had anything saved into it (used to seed). */
  isEmpty(): Promise<boolean>;
}
