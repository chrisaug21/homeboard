const CACHE_NAME = "homeboard-v2.0.43";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "/display",
  "./signup.html",
  "./manifest.json",
  "./manifest-admin.json",
  "./homeboard_logo.svg",
  "./js/vendor/confetti.min.js",
  "./js/vendor/cropper.min.css",
  "./js/vendor/cropper.min.js",
  "./js/vendor/gsap.min.js",
  "./sw.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("homeboard-v") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isLocalAppShellRequest =
    requestUrl.origin === self.location.origin &&
    (
      event.request.mode === "navigate" ||
      event.request.destination === "script" ||
      event.request.destination === "style" ||
      event.request.destination === "document" ||
      requestUrl.pathname === "/display" ||
      requestUrl.pathname === "/admin" ||
      requestUrl.pathname.endsWith(".html") ||
      requestUrl.pathname.endsWith(".json")
    );

  function getNavigationFallback() {
    if (requestUrl.pathname === "/signup") {
      return caches.match("./signup.html");
    }

    if (requestUrl.pathname === "/display") {
      return caches.match("/display").then((response) => response || caches.match("./index.html"));
    }

    if (requestUrl.pathname === "/admin") {
      return caches.match("./index.html");
    }

    if (requestUrl.pathname === "/") {
      return caches.match("./").then((response) => response || caches.match("./index.html"));
    }

    return caches.match("./index.html");
  }

  event.respondWith(
    isLocalAppShellRequest
      ? fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok && networkResponse.type === "basic") {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }

            return networkResponse;
          })
          .catch(async () => {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) {
              return cachedResponse;
            }

            if (event.request.mode === "navigate") {
              return getNavigationFallback();
            }

            throw new Error("Network request failed");
          })
      : caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok && networkResponse.type === "basic") {
              const responseClone = networkResponse.clone();

              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }

            return networkResponse;
          }).catch(() => {
            if (event.request.mode === "navigate") {
              return getNavigationFallback();
            }

            throw new Error("Network request failed");
          });
        })
  );
});
