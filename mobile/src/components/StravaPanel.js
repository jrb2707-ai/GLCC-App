import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api, formatDetail } from "../lib/api";
import { useAuth } from "../lib/store";
import { colors, radius } from "../constants/theme";
import { timeAgo } from "../lib/util";

const STRAVA = "#FC4C02";

export default function StravaPanel({ onSynced }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/strava/status");
      setStatus(data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user?.is_admin) return null;

  async function connect() {
    try {
      const { data } = await api.get("/strava/connect");
      // Open OAuth in an in-app browser session; when it redirects back to
      // greylynncc.com, the deep-link scheme "glcc://" or associated domain
      // will bring the user back.
      const result = await WebBrowser.openAuthSessionAsync(data.url, "glcc://");
      if (result.type === "success") {
        setTimeout(load, 1500);
      }
    } catch (e) {
      Alert.alert("Strava", formatDetail(e));
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const { data } = await api.post("/strava/sync");
      Alert.alert("Strava synced", `${data.synced} events · ${data.deleted} removed`);
      await load();
      if (onSynced) onSynced();
    } catch (e) {
      Alert.alert("Strava", formatDetail(e));
    } finally { setBusy(false); }
  }

  async function disconnect() {
    Alert.alert("Disconnect Strava?", "Existing synced rides stay put, but no new events will be pulled.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect", style: "destructive",
        onPress: async () => {
          try {
            await api.post("/strava/disconnect");
            await load();
          } catch (e) { Alert.alert("Strava", formatDetail(e)); }
        },
      },
    ]);
  }

  const connected = status?.connected;
  const needsReconnect = status?.needs_reconnect;

  const shellStyle = needsReconnect
    ? { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.40)" }
    : connected
    ? { backgroundColor: "rgba(252,76,2,0.10)", borderColor: "rgba(252,76,2,0.40)" }
    : { backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderStyle: "dashed" };

  return (
    <View style={[s.shell, shellStyle]}>
      <View style={[s.badge, { backgroundColor: needsReconnect ? "rgba(239,68,68,0.20)" : STRAVA }]}>
        <Text style={{ color: "#fff", fontWeight: "900" }}>⚡</Text>
      </View>
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={s.eyebrow}>STRAVA · CLUB {status?.club_id || "50775"}</Text>
        <Text style={s.mainLine} numberOfLines={1}>
          {needsReconnect
            ? "Authorisation expired — reconnect"
            : connected
            ? `Synced · ${status?.event_count || 0} events · ${timeAgo(status?.last_sync_at)}`
            : "Not connected"}
        </Text>
      </View>
      {needsReconnect ? (
        <TouchableOpacity onPress={connect} style={s.actionBtn} testID="strava-reconnect">
          <Text style={s.actionTxt}>RECONNECT</Text>
        </TouchableOpacity>
      ) : connected ? (
        <View style={{ flexDirection: "row", gap: 4 }}>
          <TouchableOpacity onPress={syncNow} disabled={busy} style={s.actionBtn} testID="strava-sync">
            {busy && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 4 }} />}
            <Text style={s.actionTxt}>SYNC</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={disconnect} style={s.ghostBtn} testID="strava-disconnect">
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>×</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={connect} style={s.actionBtn} testID="strava-connect">
          <Text style={s.actionTxt}>CONNECT</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  shell: { borderWidth: 1, borderRadius: radius.md, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  badge: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  mainLine: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 2 },
  actionBtn: { backgroundColor: STRAVA, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, flexDirection: "row", alignItems: "center" },
  actionTxt: { color: "#fff", fontWeight: "900", fontSize: 10, letterSpacing: 2 },
  ghostBtn: { width: 28, height: 28, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
