// ============================================================
// WEDLINKA — SERVICE WORKER
// Wersja: 1.0.0
// ============================================================

const CACHE_NAME = 'wedlinka-v11';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './cennik.html',
  './css/style.css',
  './js/app.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/db.js',
  './js/modules/produkty.js',
  './js/modules/placeholder.js',
  './js/modules/dashboard.js',
  './js/modules/szarze.js',
  './js/modules/klienci.js',
  './js/modules/zamowienia.js',
  './js/modules/produkcja.js',
  './js/modules/sprzedaz.js',
  './js/modules/raporty.js',
  './icons/icon.svg',
];

// INSTALL — Cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE — Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// FETCH — Cache-first for app shell, network-first for Firebase
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Always fetch from network for Firebase / Google APIs
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebase.google.com') ||
    url.includes('gstatic.com/firebasejs') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for app shell
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: return index.html for navigation requests
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// Handle update messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
