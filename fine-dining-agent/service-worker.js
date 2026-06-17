const CACHE_NAME = "dining-agent-shell-v37";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=37",
  "./app.js?v=37",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => (
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html")),
    );
    return;
  }

  if (
    ["/chat", "/menu", "/menu/text", "/suggest", "/retailer/negotiate"].includes(url.pathname)
    || url.pathname.startsWith("/profile")
    || url.pathname.startsWith("/location")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => (
        new Response(JSON.stringify({ detail: "offline" }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        })
      )),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
    )),
  );
});
