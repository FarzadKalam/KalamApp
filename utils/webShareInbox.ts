export type SharedInboxFile = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  dataBase64: string;
};

export type SharedInboxPayload = {
  id: string;
  title: string;
  text: string;
  url: string;
  files: SharedInboxFile[];
  createdAt: number;
};

const DB_NAME = 'tazesystem-share-db';
const STORE_NAME = 'shared_inbox';
const DB_VERSION = 1;

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open shared inbox database'));
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> => {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await task(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Shared inbox transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Shared inbox transaction aborted'));
    });
    return result;
  } finally {
    db.close();
  }
};

export const getSharedInboxPayload = async (id: string) => {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return null;

  return withStore('readonly', (store) =>
    new Promise<SharedInboxPayload | null>((resolve, reject) => {
      const request = store.get(normalizedId);
      request.onsuccess = () => resolve((request.result as SharedInboxPayload) || null);
      request.onerror = () => reject(request.error || new Error('Could not read shared payload'));
    }),
  );
};

export const removeSharedInboxPayload = async (id: string) => {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;

  await withStore('readwrite', (store) =>
    new Promise<void>((resolve, reject) => {
      const request = store.delete(normalizedId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Could not remove shared payload'));
    }),
  );
};

const decodeBase64 = (value: string) => {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
};

export const sharedInboxFileToFile = (input: SharedInboxFile) => {
  const dataBase64 = String(input?.dataBase64 || '');
  const payload = dataBase64.includes(',') ? dataBase64.split(',').pop() || '' : dataBase64;
  const binary = decodeBase64(payload);
  const mimeType = String(input?.type || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileName = String(input?.name || `shared-${Date.now()}`).trim() || `shared-${Date.now()}`;
  return new File([binary], fileName, {
    type: mimeType,
    lastModified: Number(input?.lastModified || Date.now()),
  });
};
