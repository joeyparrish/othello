const cacheName = 'othello';
const cachedFiles = [
  // Third-party code.
  'https://unpkg.com/peerjs@1.0.4/dist/peerjs.min.js',

  // Reconstruct the folder URL without having to hard-code the path.
  (new URL('.', location.href)).href,

  // The rest are relative URLs.
  'index.html',
  'othello.css',
  'othello.js',
  'close.svg',
  'volume_off.svg',
  'volume_up.svg',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

async function install() {
  const cache = await caches.open(cacheName);
  await cache.addAll(cachedFiles);
}

async function updateCache(cache, request) {
  // Disable the browser's cache, since we want control of updates ourselves.
  request.cache = 'no-store';

  const response = await fetch(request);
  // Important: clone() is because cache.put consumes the response body!
  await cache.put(request, response.clone());
  return response;
}

function requestIsForCachedFile(request) {
  return cachedFiles.some((file) => {
    // An exact match (for third-party code).
    if (request.url == file) {
      return true;
    }

    // A filename match (for our code).
    if (request.url.endsWith('/' + file)) {
      return true;
    }

    return false;
  });
}

async function handleRequest(request) {
  const cache = await caches.open(cacheName);
  const response = await cache.match(request);

  if (response) {
    updateCache(cache, request);  // happens in the background
    return response;
  }

  console.error('Missing one of our files in cache!');
  // This will wait until we have the file in cache, then return it.
  // This should not happen.
  return await updateCache(cache, request);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();  // Take over for any older service worker right away.

  event.waitUntil(install());
});

self.addEventListener('fetch', (event) => {
  // Important: don't handle requests for files that aren't ours.
  if (!requestIsForCachedFile(event.request)) {
    return;
  }

  event.respondWith(handleRequest(event.request));
});
