// Service Worker — "network first": always fetch the freshest version when
// online, fall back to cache only when offline, so the app never gets stuck on
// a stale build. CDN assets (Tailwind, pdf.js) are cached opaquely on first use.
const CACHE = "hvac-takeoff-v12";
const SHELL = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/state.js",
  "js/viewport.js",
  "js/renderer.js",
  "js/scale.js",
  "js/rooms.js",
  "js/measure.js",
  "js/routing.js",
  "js/estimate.js",
  "js/business.js",
  "js/projects.js",
  "js/ingest.js",
  "js/input.js",
  "js/ui.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // cache same-origin successful responses for offline use
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((r) => {
          if (r) return r;
          // Only navigations may fall back to the app shell. Never return
          // index.html for CSS/JS/asset requests — serving HTML as a stylesheet
          // or script silently breaks the page.
          if (e.request.mode === "navigate") return caches.match("index.html");
          return Response.error();
        })
      )
  );
});
