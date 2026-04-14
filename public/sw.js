const CACHE_NAME = 'tazesystem-runtime-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

const SHARE_DB_NAME = 'tazesystem-share-db';
const SHARE_STORE_NAME = 'shared_inbox';
const SHARE_DB_VERSION = 1;

const openShareDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open share db'));
  });

const saveSharedPayload = async (payload) => {
  const db = await openShareDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SHARE_STORE_NAME);
      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not save share payload'));
      tx.onabort = () => reject(tx.error || new Error('Share payload transaction aborted'));
    });
  } finally {
    db.close();
  }
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read shared file'));
    reader.readAsDataURL(file);
  });

const handleShareTargetPost = async (request) => {
  const formData = await request.formData();
  const files = [];

  for (const value of formData.getAll('files')) {
    if (!(value instanceof File)) continue;
    const base64 = await fileToBase64(value);
    files.push({
      name: String(value.name || 'shared-file').trim() || 'shared-file',
      type: String(value.type || 'application/octet-stream').trim() || 'application/octet-stream',
      size: Number(value.size || 0),
      lastModified: Number(value.lastModified || Date.now()),
      dataBase64: base64,
    });
  }

  const shareId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await saveSharedPayload({
    id: shareId,
    title: String(formData.get('title') || '').trim(),
    text: String(formData.get('text') || '').trim(),
    url: String(formData.get('url') || '').trim(),
    files,
    createdAt: Date.now(),
  });

  return Response.redirect(`/share-target?share_id=${encodeURIComponent(shareId)}`, 303);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

const shouldHandleRequest = (requestUrl, method) => {
  if (method !== 'GET') return false;
  if (requestUrl.origin !== self.location.origin) return false;
  if (requestUrl.pathname.startsWith('/api/')) return false;
  return true;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method === 'POST' && requestUrl.origin === self.location.origin && requestUrl.pathname === '/share-target') {
    event.respondWith(handleShareTargetPost(request));
    return;
  }

  if (!shouldHandleRequest(requestUrl, request.method)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return caches.match('/index.html');
        })
    );
    return;
  }

  const isStaticAsset = ['style', 'script', 'font', 'image', 'worker'].includes(request.destination) || requestUrl.pathname.startsWith('/assets/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error('Network unavailable and no cache entry found.');
      })
  );
});
