// Bush Hills Church of Christ - PWA service worker (NOT CURRENTLY DEPLOYED)
//
// This file is not in use. It's kept only as reference logic in case this
// project is revisited later with a real fix.
//
// The original plan was to inline this source into a Blob and register the
// Blob URL from Durable's Footer Code box, as a workaround for Durable not
// allowing same-origin file uploads. That does not work - browsers reject
// blob:/data: URLs for service worker registration outright (confirmed via
// testing: Chrome throws "The URL protocol of the script is not supported").
// There is no client-side workaround for this restriction.
//
// A real fix would require serving this file as a genuine same-origin
// https:// resource from bushhillschurch.com itself, e.g. by proxying the
// domain's DNS through a Cloudflare Worker that serves /sw.js (and
// manifest.json/icons) directly while passing every other request through
// to Durable untouched. That needs DNS/registrar access and is a separate,
// larger project. See README.md.

const ORIGIN = 'https://bushhillschurch.com';
const CACHE_NAME = 'bhcoc-shell-v1';
const CORE_PATHS = [
  '/',
  '/service-stream',
  '/contact-us',
  '/our-message',
  '/resources',
  '/donate',
  '/leadership',
  '/audio-ministry'
];
const CORE_PAGES = CORE_PATHS.map((path) => ORIGIN + path);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_PAGES.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== ORIGIN) return; // don't touch cross-origin CDN/embed/analytics requests

  const isCorePage = request.mode === 'navigate' || CORE_PATHS.includes(url.pathname);
  if (!isCorePage) return; // let everything else (JS/CSS/data) go straight to network

  event.respondWith(staleWhileRevalidate(request));
});

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || (request.mode === 'navigate' ? cache.match(ORIGIN + '/') : undefined));
      return cached || networkFetch;
    })
  );
}
