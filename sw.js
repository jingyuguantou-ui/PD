const CACHE = "pindou-v5";
const ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/palette.js",
  "js/mard-colors.js",
  "js/library-db.js",
  "js/tutorial.js",
  "js/features.js",
  "js/versions.js",
  "js/shortcuts.js",
  "js/error-boundary.js",
  "js/ipad-fixes.js",
  "js/tests.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];

let dynamicManifest = null;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "update-manifest") {
    dynamicManifest = { theme_color: e.data.theme_color, background_color: e.data.background_color };
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.endsWith("manifest.webmanifest") && dynamicManifest) {
    e.respondWith(
      fetch(req).then((res) => {
        return res.json().then((manifest) => {
          manifest.theme_color = dynamicManifest.theme_color;
          manifest.background_color = dynamicManifest.background_color;
          return new Response(JSON.stringify(manifest), {
            headers: { "Content-Type": "application/manifest+json" },
          });
        });
      })
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") return caches.match("index.html");
          return undefined;
        })
      )
  );
});
