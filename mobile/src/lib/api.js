import axios from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const BASE = (Constants.expoConfig?.extra?.apiUrl || "https://greylynncc.com").replace(/\/$/, "");

export const api = axios.create({ baseURL: `${BASE}/api`, timeout: 15000 });

let inMemoryToken = null;

api.interceptors.request.use(async (config) => {
  if (!inMemoryToken) {
    inMemoryToken = await SecureStore.getItemAsync("glcc.token");
  }
  if (inMemoryToken) {
    config.headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  return config;
});

export async function setToken(token) {
  inMemoryToken = token || null;
  if (token) await SecureStore.setItemAsync("glcc.token", token);
  else await SecureStore.deleteItemAsync("glcc.token");
}

export function formatDetail(err) {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e.msg || String(e)).join(" · ");
  return err?.message || "Something went wrong";
}
