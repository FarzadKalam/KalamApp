const CACHE_VERSION = 'v3';
const SHELL_CACHE = `tazesystem-shell-${CACHE_VERSION}`;
const PAGE_CACHE = `tazesystem-pages-${CACHE_VERSION}`;
const ASSET_CACHE = `tazesystem-assets-${CACHE_VERSION}`;
const DATA_CACHE = `tazesystem-data-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE, DATA_CACHE];

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-512x512.png',
  '/favicon.svg',
];

const MAX_PAGE_ENTRIES = 20;
const MAX_ASSET_ENTRIES = 80;
const MAX_DATA_ENTRIES = 40;

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

const shouldHandleRequest = (requestUrl, request) => {
  if (request.method !== 'GET') return false;
  if (requestUrl.origin !== self.location.origin) return false;
  if (requestUrl.pathname.startsWith('/api/')) return false;
  if (request.headers.has('range')) return false;
  return true;
};

const shouldCacheResponse = (response) => {
  if (!response) return false;
  if (response.status === 206) return false;
  if (response.type === 'error') return false;
  return response.ok || response.type === 'opaque';
};

const limitCacheEntries = async (cacheName, maxEntries) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const overflow = keys.length - maxEntries;
  await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
};

const putInCache = async (cacheName, request, response, maxEntries) => {
  if (!shouldCacheResponse(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  if (maxEntries) {
    await limitCacheEntries(cacheName, maxEntries);
  }
  return response;
};

const matchShell = () => caches.match('/index.html', { ignoreSearch: true });

const isStaticAssetRequest = (requestUrl, request) => {
  if (requestUrl.pathname.startsWith('/assets/')) return true;
  if (requestUrl.pathname.startsWith('/font/')) return true;
  if (requestUrl.pathname.startsWith('/calendar/')) return true;
  if (requestUrl.pathname.endsWith('.json')) return true;
  return ['style', 'script', 'font', 'image', 'worker'].includes(request.destination);
};

const handleNavigationRequest = async (event) => {
  try {
    const preloadedResponse = await event.preloadResponse;
    if (preloadedResponse) {
      void putInCache(PAGE_CACHE, event.request, preloadedResponse.clone(), MAX_PAGE_ENTRIES);
      return preloadedResponse;
    }

    const networkResponse = await fetch(event.request);
    void putInCache(PAGE_CACHE, event.request, networkResponse.clone(), MAX_PAGE_ENTRIES);
    return networkResponse;
  } catch {
    const cachedPage = await caches.match(event.request, { ignoreSearch: true });
    if (cachedPage) return cachedPage;
    const shell = await matchShell();
    if (shell) return shell;
    throw new Error('Navigation failed and no cached shell is available.');
  }
};

const handleStaticAssetRequest = async (request) => {
  const cached = await caches.match(request, { ignoreSearch: false });
  const networkPromise = fetch(request)
    .then((response) => putInCache(ASSET_CACHE, request, response, MAX_ASSET_ENTRIES))
    .catch(() => undefined);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  throw new Error('Static asset unavailable and not cached.');
};

const handleDataRequest = async (request) => {
  try {
    const networkResponse = await fetch(request);
    void putInCache(DATA_CACHE, request, networkResponse.clone(), MAX_DATA_ENTRIES);
    return networkResponse;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    throw new Error('Network unavailable and no cache entry found.');
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !ALL_CACHES.includes(key)).map((key) => caches.delete(key)));

      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method === 'POST' && requestUrl.origin === self.location.origin && requestUrl.pathname === '/share-target') {
    event.respondWith(handleShareTargetPost(request));
    return;
  }

  if (!shouldHandleRequest(requestUrl, request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  if (isStaticAssetRequest(requestUrl, request)) {
    event.respondWith(handleStaticAssetRequest(request));
    return;
  }

  event.respondWith(handleDataRequest(request));
});
