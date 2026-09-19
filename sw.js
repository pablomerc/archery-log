/* sw.js — caches the app shell so it opens instantly and works with no signal
   (club fields have famously bad reception). Data never leaves localStorage. */
var CACHE = 'archery-log-v3';
var SHELL = [
  './', './index.html', './css/app.css',
  './js/store.js', './js/sync.js', './js/parse.js', './js/plan.js', './js/charts.js',
  './js/views.js', './js/views2.js', './js/app.js',
  './manifest.webmanifest', './icons/icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { /* a missing optional file must not break install */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Network first, falling back to cache: you always get the newest version
   when online, and a working app when you are not.
   'no-cache' forces a revalidation with the server rather than letting the
   browser's own HTTP cache hand back a stale file — without it, a freshly
   deployed update can keep serving the old JS for hours. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Never serve a cached copy of the log or of anything from GitHub.
  if (/\/data\/log\.json$/.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
