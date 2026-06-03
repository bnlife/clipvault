// ClipVault Service Worker — 离线支持
const CACHE = "clipvault-v1";
const URLS = ["/", "/index.html", "/app.js", "/style.css", "/manifest.json"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(URLS)));
});

self.addEventListener("fetch", (e) => {
    e.respondWith(
        caches.match(e.request).then((r) => r || fetch(e.request))
    );
});
