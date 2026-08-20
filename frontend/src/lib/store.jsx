import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, setToken, getToken, wsUrl, formatDetail } from "./api";
import { toast } from "sonner";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const EventsCtx = createContext(null);
export const useEvents = () => useContext(EventsCtx);

// ---- Browser Notifications (Expo Push fallback for web preview) ----
export function browserPushSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function browserPushPermission() {
  if (!browserPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserPush() {
  if (!browserPushSupported()) return "unsupported";
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function fireBrowserNotification(title, body, tag) {
  if (!browserPushSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    // Skip if the tab is focused — the in-app toast is enough.
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    new Notification(title, { body, tag, icon: "/favicon.ico" });
  } catch (e) {
    // ignore
  }
}

export function AppProviders({ children }) {
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const listeners = useRef(new Set());
  const wsRef = useRef(null);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const emit = useCallback((evt) => {
    listeners.current.forEach((fn) => {
      try {
        fn(evt);
      } catch (e) {
        // ignore
      }
    });
  }, []);

  const connectWs = useCallback(
    (token) => {
      if (!token) return;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          // ignore
        }
      }
      const ws = new WebSocket(wsUrl(token));
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          emit(data);
          if (data.type === "coffee.round") {
            toast(`☕ ${data.round.rider_name} is buying a round`, {
              description: data.round.coffee,
            });
            fireBrowserNotification(
              "Coffee round ☕",
              `${data.round.rider_name} — ${data.round.coffee}`,
              "coffee-round"
            );
          }
          if (data.type === "chat.mention") {
            toast(`@${data.from} mentioned you`, { description: data.text });
            fireBrowserNotification(
              `${data.from} mentioned you`,
              data.text,
              "chat-mention"
            );
          }
          if (data.type === "rider.pending") {
            toast(`New rider pending approval`, { description: data.rider.name });
          }
        } catch (err) {
          // maybe pong
        }
      };
      ws.onclose = () => {
        // reconnect after a delay if still logged in
        setTimeout(() => {
          const t = getToken();
          if (t && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
            connectWs(t);
          }
        }, 2000);
      };
    },
    [emit]
  );

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setBooted(true);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
        connectWs(t);
      } catch (e) {
        console.warn("[glcc] auth boot failed:", e?.message || e);
        setToken(null);
      } finally {
        setBooted(true);
      }
    })();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    connectWs(data.token);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    // Only auto-login approved users. Pending users should see the
    // dedicated "awaiting approval" screen before entering the club.
    if (data.user?.status !== "pending") {
      setToken(data.token);
      setUser(data.user);
      connectWs(data.token);
    }
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    if (wsRef.current) wsRef.current.close();
  };

  const refreshMe = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      console.warn("[glcc] refreshMe failed:", e?.message || e);
    }
  };

  return (
    <AuthCtx.Provider value={{ user, booted, login, register, logout, refreshMe, formatDetail }}>
      <EventsCtx.Provider value={{ subscribe }}>{children}</EventsCtx.Provider>
    </AuthCtx.Provider>
  );
}
