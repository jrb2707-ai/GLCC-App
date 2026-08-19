import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BASE}/api`;

export const api = axios.create({
  baseURL: API_BASE,
});

let currentToken = null;

export function setToken(token) {
  currentToken = token;
  if (token) {
    localStorage.setItem("glcc_token", token);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    localStorage.removeItem("glcc_token");
    delete api.defaults.headers.common["Authorization"];
  }
}

export function getToken() {
  if (currentToken) return currentToken;
  const t = localStorage.getItem("glcc_token");
  if (t) {
    currentToken = t;
    api.defaults.headers.common["Authorization"] = `Bearer ${t}`;
  }
  return currentToken;
}

export function wsUrl(token) {
  const url = new URL(BASE);
  const proto = url.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${url.host}/api/ws?token=${encodeURIComponent(token)}`;
}

export function formatDetail(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e.msg || JSON.stringify(e)).join(" · ");
  return String(d);
}
