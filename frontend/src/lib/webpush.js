// GLCC Web Push registration helper — registers /sw.js, subscribes to
// PushManager with the backend's VAPID public key, and posts the resulting
// subscription to /api/webpush/subscribe. Silently no-ops if the browser
// doesn't support push or the user denies permission.
import { api } from "./api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let currentSubscription = null;

export async function registerWebPush({ silent = true } = {}) {
  try {
    if (typeof window === "undefined") return null;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

    let permission = Notification.permission;
    if (permission === "default" && !silent) {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return null;

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    // Fetch VAPID public key from server
    const { data } = await api.get("/webpush/vapid-key");
    if (!data?.public_key) return null;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });
    }
    const json = sub.toJSON();
    if (!json.keys || !json.endpoint) return null;

    await api.post("/webpush/subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    currentSubscription = sub;
    return sub;
  } catch (e) {
    if (!silent) throw e;
    return null;
  }
}

export async function unregisterWebPush() {
  try {
    if (!currentSubscription) {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      currentSubscription = await reg?.pushManager?.getSubscription?.();
    }
    if (currentSubscription) {
      const endpoint = currentSubscription.endpoint;
      await currentSubscription.unsubscribe();
      await api.delete("/webpush/unsubscribe", { data: { endpoint } });
      currentSubscription = null;
    }
  } catch (_) { /* ignore */ }
}

export function isWebPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function webPushPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}
