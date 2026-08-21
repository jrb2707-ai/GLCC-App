// Thin AsyncStorage cache for the payloads a rider stares at while stopped
// at a light. Everything is best-effort; failures are swallowed so the app
// still boots when storage is unavailable.
import AsyncStorage from "@react-native-async-storage/async-storage";

const NS = "glcc.cache.v1";
const key = (bucket) => `${NS}.${bucket}`;

export async function readCache(bucket) {
  try {
    const raw = await AsyncStorage.getItem(key(bucket));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export async function writeCache(bucket, value) {
  try {
    await AsyncStorage.setItem(key(bucket), JSON.stringify(value));
  } catch (e) { /* ignore */ }
}

export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(NS));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch (e) { /* ignore */ }
}
