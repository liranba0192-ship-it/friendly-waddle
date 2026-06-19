// Service Worker — מאפשר שימוש אופליין בקליפת האפליקציה.
const CACHE = "morning-briefing-v2";
const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "vendor/marked.min.js",
  "js/store.js",
  "js/briefing.js",
  "js/workout.js",
  "js/food.js",
  "js/weight.js",
  "js/more.js",
  "data/foods.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // תוכן התדריכים: רשת קודם (לקבל את החדש), נפילה למטמון.
  if (url.pathname.includes("/briefings/")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // קליפת האפליקציה: מטמון קודם, נפילה לרשת.
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
