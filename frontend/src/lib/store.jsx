import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, setToken, getToken, wsUrl, formatDetail } from "./api";
import { registerWebPush, unregisterWebPush } from "./webpush";
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
    // Silently attempt web push registration — only proceeds if permission is
    // already granted from a previous visit. New users click the "Enable
    // browser push" button in their profile to grant.
    registerWebPush({ silent: true });
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.user?.status !== "pending") {
      setToken(data.token);
      setUser(data.user);
      connectWs(data.token);
      registerWebPush({ silent: true });
    }
    return data.user;
  };

  const logout = () => {
    unregisterWebPush();
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
    <ThemeProvider>
      <AuthCtx.Provider value={{ user, booted, login, register, logout, refreshMe, formatDetail }}>
        <EventsCtx.Provider value={{ subscribe }}>{children}</EventsCtx.Provider>
      </AuthCtx.Provider>
    </ThemeProvider>
  );
}


// ---- Theme (light / dark / auto) ----
// Admins can flip the whole app between light and dark, or leave it on auto
// which follows the OS/browser preference. Choice persists per browser.
const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

const THEME_KEY = "glcc.theme";
function readSavedTheme() {
  try { const v = localStorage.getItem(THEME_KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readSavedTheme());

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "auto") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", theme);
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* private mode */ }
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t), []);
  const cycleTheme = useCallback(() => {
    setThemeState((cur) => (cur === "auto" ? "light" : cur === "light" ? "dark" : "auto"));
  }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme, cycleTheme }}>{children}</ThemeCtx.Provider>;
}
