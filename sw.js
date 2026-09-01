const CACHE = "nexo-app-v7-offline";
const CORE = ["./","./index.html","./offline.html","./app.react.min.js","./favicon.svg","./manifest.webmanifest","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./vendor/react.production.min.js","./vendor/react-dom.production.min.js","./vendor/framer-motion.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const doc = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (doc) {
    e.respondWith(fetch(req).then(res => { const x = res.clone(); caches.open(CACHE).then(c => c.put(req, x)); return res; }).catch(() => caches.match(req).then(h => h || caches.match("./index.html") || caches.match("./offline.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(h => h || fetch(req).then(res => { if (res.ok) { const x = res.clone(); caches.open(CACHE).then(c => c.put(req, x)); } return res; }).catch(() => caches.match("./offline.html"))));
});
