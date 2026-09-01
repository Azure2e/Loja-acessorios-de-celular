importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");
workbox.setConfig({ debug: false });
workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.precaching.precacheAndRoute([
  { url: "./index.html", revision: "wb7" },
  { url: "./offline.html", revision: "wb7" },
  { url: "./app.react.min.js", revision: "wb7" },
  { url: "./manifest.webmanifest", revision: "wb7" },
  { url: "./icon-192.png", revision: "wb7" },
  { url: "./icon-512.png", revision: "wb7" }
]);
workbox.routing.registerRoute(
  ({ request }) => request.destination === "image",
  new workbox.strategies.CacheFirst({
    cacheName: "nexo-images",
    plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 2592000 })]
  })
);
workbox.routing.registerRoute(
  ({ request }) => request.destination === "script" || request.destination === "style",
  new workbox.strategies.StaleWhileRevalidate({ cacheName: "nexo-assets" })
);
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({ cacheName: "nexo-pages" })
);
