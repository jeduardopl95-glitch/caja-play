const prefix = "caja-play-offline-";
const cacheName = prefix + version;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    assets.map(url => new Request(url, { cache: "reload" }))
  )));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = event.request.mode === "navigate" && url.pathname === "/" ? "/index.html" : url.pathname;
  if (!assets.includes(path)) return;
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(path) ?? fetch(event.request)
  ));
});
