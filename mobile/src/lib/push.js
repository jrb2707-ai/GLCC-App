// Expo push registration for GLCC. Requests permission, gets the Expo push
// token, and posts it to /api/push/register. Silently no-ops on the web /
// unsupported platforms so it can be called opportunistically after login.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "./api";

// Show incoming push as a heads-up notification when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registeredToken = null;

export async function registerForPush() {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null; // simulators can't receive push

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "GLCC",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D4FF00",
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    undefined;

  let token;
  try {
    const res = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    token = res.data;
  } catch (e) {
    return null;
  }

  if (!token || token === registeredToken) return token;
  registeredToken = token;

  try {
    await api.post("/push/register", {
      expo_push_token: token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      project_id: projectId,
    });
  } catch (e) {
    // Non-fatal — the token will be re-attempted on next login/boot.
    registeredToken = null;
  }
  return token;
}

export async function unregisterPush() {
  if (!registeredToken) return;
  try {
    await api.delete("/push/unregister", { data: { expo_push_token: registeredToken } });
  } catch (e) { /* ignore */ }
  registeredToken = null;
}
