// LabFlow Service Worker — DEV
const CACHE_NAME = 'labflow-dev-v20.07';

const CORE = [
  '/oplus-lms-dev/',
  '/oplus-lms-dev/index.html',
  '/oplus-lms-dev/manifest.json',
  '/oplus-lms-dev/icon-192.png',
  '/oplus-lms-dev/icon-512.png',
];
const DATA = [
  '/oplus-lms-dev/doctors.json',
  '/oplus-lms-dev/catalogue.json',
  '/oplus-lms-dev/panels.json',
  '/oplus-lms-dev/preanalytical.json',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE.map(function(url) {
        return new Request(url, { cache: 'reload' });
      })).then(function() {
        return Promise.allSettled(DATA.map(function(url) {
          return cache.add(new Request(url, { cache: 'reload' }));
        }));
      });
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        if (e.request.mode === 'navigate') return caches.match('/oplus-lms-dev/index.html');
      });
    })
  );
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
