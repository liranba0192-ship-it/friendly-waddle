// Service Worker — "רשת קודם": תמיד מביא את הגרסה העדכנית כשיש אינטרנט,
// ונופל למטמון רק במצב לא-מקוון. כך האפליקציה לא "נתקעת" על גרסה ישנה.
const CACHE = "morning-briefing-v66";
const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "vendor/marked.min.js",
  "vendor/supabase.js",
  "js/store.js",
  "js/icons.js",
  "js/sync.js",
  "js/nutrition.js",
  "js/scanner.js",
  "js/briefing.js",
  "js/workout.js",
  "js/food.js",
  "js/weight.js",
  "js/more.js",
  "js/learn.js",
  "js/helpbot.js",
  "js/shop.js",
  "js/home.js",
  "js/me.js",
  "fonts/fonts.css",
  "fonts/heebo-hebrew-NGS6v5_NC0k9P9H0TbFzsQ.woff2",
  "fonts/heebo-latin-NGS6v5_NC0k9P9H2TbE.woff2",
  "fonts/rubik-hebrew-iJWKBXyIfDnIV7nDrXyi0A.woff2",
  "fonts/rubik-latin-iJWKBXyIfDnIV7nBrXw.woff2",
  "data/foods.json",
  "data/exercises.json",
  "data/vocab.json",
  "data/finance.json",
  "data/ai-guide.json",
  "data/general-knowledge.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/logo-mark.svg",
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

// רשת קודם לכל בקשת GET; שומר עותק טרי למטמון; נופל למטמון אם אין רשת.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
