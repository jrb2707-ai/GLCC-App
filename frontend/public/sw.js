/* eslint-disable no-restricted-globals */
// GLCC service worker — receives Web Push from the FastAPI backend via VAPID.
// Payload shape: { title, body, data }.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "GLCC", body: "New activity from the club" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    // Some pushes ship plain text
    try { payload.body = event.data.text(); } catch (__) {}
  }
  const title = payload.title || "GLCC";
  const options = {
    body: payload.body || "",
    icon: "/glcc-icon-192.png",
    badge: "/glcc-icon-192.png",
    data: payload.data || {},
    tag: (payload.data && payload.data.type) || "glcc",
    renotify: true,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ("focus" in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return null;
      }),
  );
});
