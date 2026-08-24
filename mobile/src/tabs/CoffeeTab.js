import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Alert, RefreshControl, Modal,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import { colors, radius, spacing } from "../constants/theme";
import Avatar from "../components/Avatar";
import RideRoundBlock from "../components/RideRoundBlock";

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function RoundRow({ round, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(round)}
      style={s.row}
      testID={`coffee-round-row-${round.id}`}
    >
      <Avatar name={round.buyer_name} photo={round.buyer_photo} size="sm" />
      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{round.buyer_name}'s shout</Text>
          {!round.closed && <View style={s.livePill}><Text style={s.livePillTxt}>LIVE</Text></View>}
        </View>
        <Text style={s.rowSub} numberOfLines={1}>{round.cafe_name} · {round.ride_name || "Ride"}</Text>
        <Text style={s.rowMeta}>{round.orders.length} ORDER{round.orders.length === 1 ? "" : "S"} · {timeAgo(round.started_at).toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CoffeeTab() {
  const { user, refreshMe } = useAuth();
  const { subscribe } = useEvents();
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [nextRide, setNextRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usual, setUsual] = useState(user?.coffee || "Medium Flat White");
  const [savingUsual, setSavingUsual] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, h, r] = await Promise.all([
        api.get("/coffee/rounds/active"),
        api.get("/coffee/rounds/history"),
        api.get("/rides"),
      ]);
      setActive(a.data.rounds || []);
      setHistory(h.data.rounds || []);
      const now = Date.now();
      const upcoming = (r.data.rides || [])
        .filter((rd) => rd.starts_at && new Date(rd.starts_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      setNextRide(upcoming[0] || (r.data.rides || [])[0] || null);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setUsual(user?.coffee || "Medium Flat White"); }, [user?.coffee]);

  useEffect(() => subscribe((evt) => {
    if (!evt.round) return;
    if (evt.type === "coffee.round.started") {
      setActive((prev) => [evt.round, ...prev.filter((r) => r.id !== evt.round.id)]);
    }
    if (evt.type === "coffee.round.updated") {
      setActive((prev) => prev.map((r) => (r.id === evt.round.id ? evt.round : r)));
    }
    if (evt.type === "coffee.round.closed") {
      setActive((prev) => prev.filter((r) => r.id !== evt.round.id));
      setHistory((prev) => [evt.round, ...prev.filter((r) => r.id !== evt.round.id)].slice(0, 20));
    }
  }), [subscribe]);

  async function saveUsual() {
    const trimmed = usual.trim();
    if (!trimmed) { Alert.alert("Coffee", "Give me your usual first."); return; }
    setSavingUsual(true);
    try {
      await api.patch("/riders/me", { coffee: trimmed });
      await refreshMe?.();
      Alert.alert("Saved", "Usual locked in — one tap next round.");
    } catch (e) { Alert.alert("Coffee", formatDetail(e)); }
    finally { setSavingUsual(false); }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accentPink} />}
      testID="coffee-tab"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <Text style={s.h1}>COFFEE</Text>
        <Text style={s.meta}>{active.length} LIVE · {history.length} PAST</Text>
      </View>

      {nextRide ? (
        <View testID="coffee-quick-shout">
          <RideRoundBlock ride={nextRide} />
        </View>
      ) : null}

      {/* Usual order */}
      <View style={s.usualCard} testID="usual-card">
        <Text style={s.eyebrow}>☕ YOUR USUAL</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            value={usual}
            onChangeText={setUsual}
            placeholder="Flat white, no sugar…"
            placeholderTextColor={colors.textMuted}
            style={s.input}
            maxLength={140}
            testID="usual-input"
          />
          <TouchableOpacity
            onPress={saveUsual}
            disabled={savingUsual || !usual.trim()}
            style={[s.saveBtn, (savingUsual || !usual.trim()) && { opacity: 0.4 }]}
            testID="usual-save"
          >
            <Text style={s.saveBtnTxt}>☕</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>Pre-fills when someone starts a round. One tap and you're in.</Text>
      </View>

      {/* Active */}
      <View style={{ marginTop: 24 }} testID="active-rounds-section">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Text style={[s.sectionHead, { color: colors.accentPink }]}>LIVE NOW</Text>
          <View style={s.hr} />
        </View>
        {loading ? (
          <View style={{ height: 60, borderRadius: radius.md, backgroundColor: colors.bgSecondary }} />
        ) : active.length === 0 ? (
          <Text style={s.emptyTxt} testID="active-empty">No active rounds. Open a ride and shout the peloton a coffee ☕</Text>
        ) : (
          active.map((r) => <RoundRow key={r.id} round={r} onPress={setDetail} />)
        )}
      </View>

      {/* History */}
      <View style={{ marginTop: 24 }} testID="history-section">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Text style={s.sectionHead}>PAST ROUNDS</Text>
          <View style={s.hr} />
        </View>
        {history.length === 0 ? (
          <Text style={s.emptyTxt} testID="history-empty">Nothing here yet — history keeps the last 7 days.</Text>
        ) : (
          history.map((r) => <RoundRow key={r.id} round={r} onPress={setDetail} />)
        )}
      </View>

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            {detail && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar name={detail.buyer_name} photo={detail.buyer_photo} size="md" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.eyebrow}>{detail.closed ? "LOCKED" : "LIVE"}</Text>
                    <Text style={s.modalTitle} numberOfLines={1}>{detail.buyer_name}'s shout</Text>
                    <Text style={s.rowSub} numberOfLines={1}>{detail.cafe_name} · {detail.ride_name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetail(null)}><Text style={{ color: colors.textMuted, fontSize: 20, padding: 4 }}>✕</Text></TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 320, marginTop: 12 }}>
                  {detail.orders.map((o) => (
                    <View key={o.user_id} style={s.orderRow}>
                      <Text style={s.orderName}>{(o.name || "").toUpperCase()}</Text>
                      <Text style={s.orderText}>{o.text}</Text>
                    </View>
                  ))}
                  {detail.orders.length === 0 && <Text style={s.hint}>No orders in.</Text>}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1: { color: colors.textPrimary, fontSize: 30, fontWeight: "900", letterSpacing: 2 },
  meta: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  eyebrow: { color: colors.accentPink, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  usualCard: { backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  input: { flex: 1, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14 },
  saveBtn: { backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  saveBtnTxt: { color: "#fff", fontSize: 18, fontWeight: "900" },
  hint: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 8 },
  sectionHead: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "900" },
  hr: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: 12, marginBottom: 8 },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  rowSub: { color: colors.textSecondary, fontSize: 12 },
  rowMeta: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 2 },
  livePill: { backgroundColor: "rgba(236,72,153,0.15)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  livePillTxt: { color: colors.accentPink, fontSize: 9, letterSpacing: 1.5, fontWeight: "900" },
  emptyTxt: { color: colors.textMuted, fontSize: 12, fontStyle: "italic" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderColor: colors.borderSubtle },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  orderRow: { backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 6 },
  orderName: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  orderText: { color: colors.textPrimary, fontSize: 13, marginTop: 2 },
});
