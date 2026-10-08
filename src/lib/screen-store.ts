/**
 * Remembers the last image uploaded to the screen. The keyboard can't send it
 * back (the official driver also just keeps a local copy), so this is what the
 * Screen tab shows on load. IndexedDB because GIFs outgrow localStorage.
 */

export interface StoredScreen {
  /** null for the generated black screen. */
  file: Blob | null;
  name: string;
  type: string;
  originalSize: boolean;
  uploadedAt: number;
}

const DB = 'openaula';
const STORE = 'screen';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadScreen(): Promise<StoredScreen | null> {
  try {
    return (await tx<StoredScreen | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function saveScreen(screen: StoredScreen): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(screen, KEY));
  } catch {}
}
