importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");
workbox.setConfig({ debug: false });
workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.precaching.precacheAndRoute([
  { url: "./index.html", revision: "wb10" },
  { url: "./offline.html", revision: "wb10" },
  { url: "./app.react.min.js", revision: "wb10" },
  { url: "./manifest.webmanifest", revision: "wb10" },
  { url: "./icon-192.png", revision: "wb10" },
  { url: "./icon-512.png", revision: "wb10" }
]);
workbox.routing.registerRoute(
  ({ request }) => request.destination === "image",
  new workbox.strategies.CacheFirst({ cacheName: "nexo-images", plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 2592000 })] })
);
workbox.routing.registerRoute(
  ({ request }) => request.destination === "font" || /\.(woff2?|ttf|otf)$/i.test(new URL(request.url).pathname),
  new workbox.strategies.CacheFirst({ cacheName: "nexo-fonts", plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31536000 })] })
);
workbox.routing.registerRoute(
  ({ request, url }) => request.destination === "script" || request.destination === "style" || /\.(js|css|svg)$/i.test(url.pathname),
  new workbox.strategies.StaleWhileRevalidate({ cacheName: "nexo-assets", plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 604800 })] })
);
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({ cacheName: "nexo-pages" })
);

