// ClipVault Service Worker — 离线 + 分享接收
const CACHE = "clipvault-v2";

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/index.html", "/app.js", "/style.css", "/manifest.json"])));
    self.skipWaiting();
});

self.addEventListener("activate", e => e.waitUntil(clients.claim()));

self.addEventListener("fetch", (e) => {
    // 分享目标: POST → 提取文本 → 重定向到主页
    if (e.request.method === "POST" && e.request.url.includes("/share-receiver")) {
        e.respondWith(
            e.request.formData().then(form => {
                const text = form.get("text") || "";
                const url = new URL(e.request.url);
                const redirect = `${url.origin}/clipvault/?text=${encodeURIComponent(text)}`;
                return Response.redirect(redirect, 302);
            })
        );
        return;
    }
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
