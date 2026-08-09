const SHELL_CACHE = "erp-companion-shell-v2";
const SHELL_ASSETS = ["/mobile-offline.html", "/mobile-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && url.pathname.startsWith("/m")) {
    event.respondWith(fetch(request).catch(() => caches.match("/mobile-offline.html")));
    return;
  }
  // Next.js assets already carry content-aware cache headers. Intercepting them here
  // can mix an old client bundle with a newly deployed page, especially in dev.
  if (url.pathname.startsWith("/_next/")) return;
  if (url.pathname.startsWith("/mobile-icon")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      return response;
    })));
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json?.() || { title: "ERP 随身助手", body: event.data?.text?.() || "你有新的待办" };
  event.waitUntil(self.registration.showNotification(data.title || "ERP 随身助手", {
    body: data.body,
    icon: "/mobile-icon.svg",
    badge: "/mobile-icon.svg",
    data: { url: data.actionUrl || "/m/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/m/notifications"));
});
