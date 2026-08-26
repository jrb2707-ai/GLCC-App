import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { api, setToken as persistToken } from "./api";
import { registerForPush } from "./push";
import { clearAllCache } from "./cache";

const AuthContext = createContext(null);
const EventsContext = createContext(null);

function wsUrl(token) {
  const base = (Constants.expoConfig?.extra?.apiUrl || "https://greylynncc.com").replace(/\/$/, "");
  const scheme = base.startsWith("https") ? "wss" : "ws";
  return `${scheme}://${base.replace(/^https?:\/\//, "")}/api/ws?token=${encodeURIComponent(token)}`;
}

// Pull a ride id out of any URL the app receives. Handles both the associated
// domain (`https://greylynncc.com/r/<id>`, `/rides/<id>`) and the custom
// scheme (`glcc://ride/<id>`).
function rideIdFromUrl(url) {
  if (!url) return null;
  try {
    const m = /(?:^|\/)(?:r|ride|rides)\/([a-zA-Z0-9]+)/.exec(url);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const [pendingRideId, setPendingRideId] = useState(null);
  const listeners = useRef(new Set());
  const wsRef = useRef(null);
  const wsToken = useRef(null);
  const reconnectTimer = useRef(null);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const emit = useCallback((evt) => {
    listeners.current.forEach((fn) => {
      try { fn(evt); } catch (e) { /* ignore */ }
    });
  }, []);

  const closeWs = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) { /* ignore */ }
      wsRef.current = null;
    }
  }, []);

  const connectWs = useCallback((token) => {
    if (!token) return;
    wsToken.current = token;
    closeWs();
    const ws = new WebSocket(wsUrl(token));
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        emit(data);
        // Foreground toasts for the two headline events (mirrors web behaviour)
        if (data.type === "chat.mention" && Platform.OS !== "web") {
          Alert.alert(`${data.from || "Someone"} mentioned you`, data.text || "");
        }
      } catch (_) { /* keepalive */ }
    };
    ws.onclose = () => {
      wsRef.current = null;
      // Reconnect if still logged in
      if (wsToken.current) {
        reconnectTimer.current = setTimeout(() => connectWs(wsToken.current), 2500);
      }
    };
    ws.onerror = () => { /* onclose handles the retry */ };
  }, [closeWs, emit]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    await persistToken(data.token);
    setUser(data.user);
    connectWs(data.token);
    registerForPush().catch(() => {});
    return data.user;
  }, [connectWs]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.user?.status !== "pending") {
      await persistToken(data.token);
      setUser(data.user);
      connectWs(data.token);
      registerForPush().catch(() => {});
    }
    return data.user;
  }, [connectWs]);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      await persistToken(null);
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    wsToken.current = null;
    closeWs();
    await persistToken(null);
    await clearAllCache();
    setUser(null);
  }, [closeWs]);

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } finally {
        setBooted(true);
      }
    })();
  }, [refreshMe]);

  // Deep-link + push-notification-tap → open the referenced ride when the
  // rider next hits the Rides tab. `consumePendingRide` clears the marker.
  useEffect(() => {
    let mounted = true;
    const handle = (url) => {
      const id = rideIdFromUrl(url);
      if (mounted && id) setPendingRideId(id);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    // A tapped push notification with data.ride_id lands us here too.
    const tapSub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const rideId = resp?.notification?.request?.content?.data?.ride_id;
      if (mounted && rideId) setPendingRideId(String(rideId));
    });
    // Cold-start case: the tap may have already resolved before we could
    // subscribe. `getLastNotificationResponseAsync` fills that gap.
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp) => {
        const rideId = resp?.notification?.request?.content?.data?.ride_id;
        if (mounted && rideId) setPendingRideId(String(rideId));
      })
      .catch(() => {});
    return () => {
      mounted = false;
      sub?.remove?.();
      tapSub?.remove?.();
    };
  }, []);

  const consumePendingRide = useCallback(() => {
    setPendingRideId((prev) => {
      if (prev) return null;
      return prev;
    });
  }, []);

  // When user becomes available (either at boot or after login), ensure the
  // WS is connected using the currently stored token. This handles the
  // cold-start refreshMe path where connectWs wasn't called yet.
  useEffect(() => {
    if (!user) return undefined;
    (async () => {
      const token = await SecureStore.getItemAsync("glcc.token");
      if (token && !wsRef.current) {
        connectWs(token);
        registerForPush().catch(() => {});
      }
    })();
    return () => { /* keep WS alive across renders */ };
  }, [user, connectWs]);

  const authValue = useMemo(
    () => ({ user, booted, login, register, logout, refreshMe, pendingRideId, consumePendingRide }),
    [user, booted, login, register, logout, refreshMe, pendingRideId, consumePendingRide]
  );
  const eventsValue = useMemo(() => ({ subscribe }), [subscribe]);

  return (
    <AuthContext.Provider value={authValue}>
      <EventsContext.Provider value={eventsValue}>{children}</EventsContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents must be inside <AuthProvider>");
  return ctx;
}


// ---- Theme (light / dark / auto) ----
// Admins can pick their preferred colour scheme. Choice persists across
// launches via SecureStore. The full light-mode visual pass is landing in
// a follow-up — for now the toggle is wired so the choice is captured and
// the app respects the value on next render.
const ThemeContext = createContext(null);
const THEME_KEY = "glcc.theme";

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("auto");

  useEffect(() => {
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(THEME_KEY);
        if (v === "light" || v === "dark" || v === "auto") setThemeState(v);
      } catch (_) { /* ignore */ }
    })();
  }, []);

  const setTheme = useCallback(async (t) => {
    setThemeState(t);
    try { await SecureStore.setItemAsync(THEME_KEY, t); } catch (_) { /* ignore */ }
  }, []);

  const cycleTheme = useCallback(async () => {
    const next = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    await setTheme(next);
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, cycleTheme }), [theme, setTheme, cycleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside <ThemeProvider>");
  return ctx;
}
