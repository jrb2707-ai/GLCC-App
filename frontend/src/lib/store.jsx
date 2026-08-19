import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, setToken, getToken, wsUrl, formatDetail } from "./api";
import { toast } from "sonner";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const EventsCtx = createContext(null);
export const useEvents = () => useContext(EventsCtx);

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
    setToken(data.token);
    setUser(data.user);
    connectWs(data.token);
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
      // ignore
    }
  };

  return (
    <AuthCtx.Provider value={{ user, booted, login, register, logout, refreshMe, formatDetail }}>
      <EventsCtx.Provider value={{ subscribe }}>{children}</EventsCtx.Provider>
    </AuthCtx.Provider>
  );
}
