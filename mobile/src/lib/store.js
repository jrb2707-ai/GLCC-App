import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken as persistToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    await persistToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.user?.status !== "pending") {
      await persistToken(data.token);
      setUser(data.user);
    }
    return data.user;
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      // token invalid — clear it
      await persistToken(null);
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await persistToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } finally {
        setBooted(true);
      }
    })();
  }, [refreshMe]);

  const value = useMemo(
    () => ({ user, booted, login, register, logout, refreshMe }),
    [user, booted, login, register, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
