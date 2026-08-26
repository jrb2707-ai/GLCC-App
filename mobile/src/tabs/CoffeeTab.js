import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Alert, RefreshControl, Modal, Animated, ImageBackground,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import { colors, radius, spacing } from "../constants/theme";
import Avatar from "../components/Avatar";
import RideRoundBlock from "../components/RideRoundBlock";

function normalizeOrder(text) {
  return String(text || "").toLowerCase().replace(/[.,!;\s]+$/g, "").replace(/\s+/g, " ").trim();
}
function tallyOrders(orders) {
  const groups = new Map();
  for (const o of orders) {
    const key = normalizeOrder(o.text);
    if (!key) continue;
    const g = groups.get(key) || { display: o.text.trim(), riders: [] };
    g.riders.push(o.name);
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => b.riders.length - a.riders.length);
}

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function LivePill() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={[s.livePill, { opacity }]}>
      <Text style={s.livePillTxt}>LIVE</Text>
    </Animated.View>
  );
}

function LiveNowHeader() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.Text style={[s.liveNowHeader, { opacity }]} testID="live-now-header">
      ● LIVE NOW
    </Animated.Text>
  );
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
          {!round.closed && <LivePill />}
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
      setNextRide(upcoming[0] || null);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // The bottom-tab navigator keeps screens mounted, so re-fetch every time
  // the Coffee tab regains focus. Without this, a round started on the Rides
  // screen won't show up here until a manual pull-to-refresh.
  useFocusEffect(useCallback(() => { load(); }, [load]));
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
      // If a live round is happening, dive straight in — no toast, no
      // context switch. Riders complained that the "saved" message felt like
      // an accidental dead-end when the LIVE pill was flashing.
      if (active.length > 0) {
        setDetail(active[0]);
      } else {
        Alert.alert("Saved", "Usual locked in — one tap next round.");
      }
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
      ) : !loading ? (
        <View style={s.noUpcomingWrap} testID="coffee-no-upcoming">
          <Text style={s.noUpcomingEyebrow}>☕ COFFEE SHOUT</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={[s.noUpcomingBtn, { backgroundColor: colors.bgSecondary }]}>
              <Text style={s.noUpcomingBtnTxt}>☕ I'M BUYING</Text>
            </View>
            <View style={s.noUpcomingBtn}>
              <Text style={s.noUpcomingBtnTxt}>SPLIT THE BILL</Text>
            </View>
          </View>
          <Text style={s.noUpcomingHint}>NO UPCOMING RIDES — SYNC STRAVA</Text>
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
          {active.length > 0 && !loading ? (
            <LiveNowHeader />
          ) : (
            <Text style={[s.sectionHead, { color: colors.textMuted }]}>LIVE NOW</Text>
          )}
          <View style={s.hr} />
        </View>
        {loading ? (
          <View testID="active-skeleton">
            <View style={{ height: 60, borderRadius: radius.md, backgroundColor: colors.bgSecondary, marginBottom: 8, opacity: 0.6 }} />
            <View style={{ height: 60, borderRadius: radius.md, backgroundColor: colors.bgSecondary, opacity: 0.4 }} />
          </View>
        ) : active.length === 0 ? (
          <Text style={s.emptyTxt} testID="active-empty">No live rounds right now.</Text>
        ) : (
          active.map((r) => <RoundRow key={r.id} round={r} onPress={setDetail} />)
        )}
      </View>

      {/* History */}
      <View style={{ marginTop: 24 }} testID="history-section">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Text style={s.sectionHead}>PAST ROUNDS · LAST 24H</Text>
          <View style={s.hr} />
        </View>
        {history.length === 0 ? (
          <Text style={s.emptyTxt} testID="history-empty">Nothing in the last 24 hours.</Text>
        ) : (
          history.map((r) => <RoundRow key={r.id} round={r} onPress={setDetail} />)
        )}
      </View>

      {/* Detail modal — coffee-cup background, 85% height, swipe-to-dismiss */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <ImageBackground
              source={{ uri: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=60" }}
              style={{ flex: 1 }}
              resizeMode="cover"
            >
              <ScrollView style={s.modalOverlay} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={s.dragHandle} />
                {detail && (
                  <RoundDetailBody
                    round={detail}
                    onChange={setDetail}
                    onClose={() => setDetail(null)}
                    usual={user?.coffee}
                    subscribe={subscribe}
                  />
                )}
              </ScrollView>
            </ImageBackground>
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
  liveNowHeader: { color: colors.accentPink, fontSize: 15, letterSpacing: 2, fontWeight: "900" },
  emptyTxt: { color: colors.textMuted, fontSize: 12, fontStyle: "italic" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { height: "85%", borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", backgroundColor: "#1a1210" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 20 },
  dragHandle: { alignSelf: "center", width: 48, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.4)", marginBottom: 12 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  orderRow: { backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 6 },
  orderName: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  orderText: { color: colors.textPrimary, fontSize: 13, marginTop: 2 },
  usualPill: { flexDirection: "row", alignItems: "center", gap: 8, borderColor: "rgba(236,72,153,0.4)", borderWidth: 1, backgroundColor: "rgba(236,72,153,0.10)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  usualPillLbl: { color: colors.accentPink, fontSize: 10, letterSpacing: 2, fontWeight: "900" },
  usualPillTxt: { color: colors.textPrimary, fontSize: 13, flex: 1 },
  sendBtn: { backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  sendBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  myOrderBox: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.35)", borderWidth: 1, borderRadius: radius.md, padding: 10, flexDirection: "row", alignItems: "center" },
  copyBarBtn: { marginTop: 12, backgroundColor: "rgba(201,152,106,0.15)", borderColor: "rgba(201,152,106,0.40)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  copyBarBtnTxt: { color: colors.accentCoffee, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  noUpcomingWrap: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  noUpcomingEyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "900", marginBottom: 10 },
  noUpcomingBtn: { flex: 1, backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", opacity: 0.55 },
  noUpcomingBtnTxt: { color: colors.textMuted, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  noUpcomingHint: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center", marginTop: 8 },
});

function RoundDetailBody({ round, onChange, onClose, usual, subscribe }) {
  const { user } = useAuth();
  const [orderText, setOrderText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribe((evt) => {
    if (!evt.round || evt.round.id !== round.id) return;
    if (["coffee.round.updated", "coffee.round.closed"].includes(evt.type)) onChange(evt.round);
  }), [subscribe, round.id, onChange]);

  const myOrder = round.orders?.find((o) => o.user_id === user?.id);
  useEffect(() => { if (myOrder?.text) setOrderText(myOrder.text); }, [myOrder?.text]);

  async function submit(textOverride) {
    const text = (textOverride ?? orderText).trim();
    if (!text) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/rides/${round.ride_id}/round/order`, { text });
      onChange(data);
      setOrderText(text);
    } catch (e) { Alert.alert("Order", formatDetail(e)); }
    finally { setBusy(false); }
  }
  async function retract() {
    setBusy(true);
    try {
      const { data } = await api.delete(`/rides/${round.ride_id}/round/order`);
      onChange(data);
      setOrderText("");
    } catch (e) { Alert.alert("Order", formatDetail(e)); }
    finally { setBusy(false); }
  }
  function copyList() {
    if (!round.orders?.length) return;
    const { Clipboard } = require("react-native");
    const tally = tallyOrders(round.orders).map((g) => `${g.riders.length}× ${g.display}`).join("\n");
    const detail = round.orders.map((o) => `- ${o.name}: ${o.text}`).join("\n");
    const text = `☕ ${round.cafe_name}\n${tally}\n\n(by rider:\n${detail})`;
    Clipboard.setString(text);
    Alert.alert("Copied", "Order list copied.");
  }

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar name={round.buyer_name} photo={round.buyer_photo} size="md" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styleseye]}>{round.closed ? "● LOCKED" : "● LIVE"}</Text>
          <Text style={styleModalTitle} numberOfLines={1}>{round.buyer_name}'s shout</Text>
          <Text style={styleRowSub} numberOfLines={1}>{round.cafe_name} · {round.ride_name}</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: "#fff", fontSize: 22, padding: 4, opacity: 0.85 }}>✕</Text></TouchableOpacity>
      </View>

      {!round.closed && (
        <View style={{ marginTop: 16 }}>
          {myOrder ? (
            <View style={styleMyOrderBox} testID="modal-my-order">
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styleOrderName, { color: "#4ade80" }]}>YOUR ORDER</Text>
                <Text style={styleOrderText} numberOfLines={2}>{myOrder.text}</Text>
              </View>
              <TouchableOpacity onPress={retract} disabled={busy} testID="modal-retract">
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, paddingHorizontal: 6, opacity: 0.7 }}>UNDO</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {usual ? (
                <TouchableOpacity onPress={() => submit(usual)} disabled={busy} style={styleUsualPill} testID="modal-usual">
                  <Text style={styleUsualPillLbl}>TAP TO ORDER MY USUAL</Text>
                  <Text style={styleUsualPillTxt} numberOfLines={2}>☕  {usual}</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center", marginBottom: 6 }}>OR TYPE SOMETHING DIFFERENT</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={orderText}
                  onChangeText={setOrderText}
                  placeholder="Flat white, no sugar…"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styleInput}
                  maxLength={140}
                  testID="modal-order-input"
                  onSubmitEditing={() => submit()}
                />
                <TouchableOpacity onPress={() => submit()} disabled={busy || !orderText.trim()} style={[styleSendBtn, (busy || !orderText.trim()) && { opacity: 0.4 }]} testID="modal-submit">
                  <Text style={styleSendBtnTxt}>SEND</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      <Text style={[styleHint, { marginTop: 18, color: "rgba(255,255,255,0.8)" }]}>
        {round.orders.length} ORDER{round.orders.length === 1 ? "" : "S"}{round.closed ? " · LOCKED" : ""}
      </Text>
      {round.orders.length > 0 && (
        <View style={{ marginTop: 10, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(201,152,106,0.55)", backgroundColor: "rgba(0,0,0,0.55)" }} testID="modal-tally">
          <Text style={{ color: colors.accentCoffee, fontSize: 12, letterSpacing: 3, fontWeight: "900", marginBottom: 12 }}>☕ BARISTA TALLY</Text>
          {tallyOrders(round.orders).map((g) => (
            <View key={g.display} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}>
              <Text style={{ color: colors.accentPink, fontSize: 30, fontWeight: "900", width: 60, lineHeight: 32 }}>{g.riders.length}×</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 22 }}>{g.display}</Text>
                <Text style={{ color: "#fff", fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginTop: 2 }} numberOfLines={2}>{g.riders.join(" · ").toUpperCase()}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: 16, marginBottom: 8 }}>BY RIDER · SCROLL FOR MORE</Text>
      <View testID="modal-order-list">
        {round.orders.map((o) => (
          <View key={o.user_id} style={styleOrderRow}>
            <Avatar name={o.name} photo={o.photo} size="sm" />
            <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
              <Text style={styleOrderName}>{(o.name || "").toUpperCase()}</Text>
              <Text style={styleOrderText} numberOfLines={2}>{o.text}</Text>
            </View>
          </View>
        ))}
        {round.orders.length === 0 && <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontStyle: "italic" }}>No orders in yet.</Text>}
      </View>

      {round.closed && round.orders.length > 0 && (
        <TouchableOpacity onPress={copyList} style={styleCopyBar} testID="modal-copy">
          <Text style={styleCopyBarTxt}>COPY LIST FOR BARISTA</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

// Aliases so the inner component can reuse the outer stylesheet without a
// forward-ref dance. Keeps the file flat and readable.
const styleseye = { color: colors.accentPink, fontSize: 11, letterSpacing: 3, fontWeight: "900" };
const styleModalTitle = { color: "#fff", fontSize: 20, fontWeight: "900" };
const styleRowSub = { color: "rgba(255,255,255,0.85)", fontSize: 13 };
const styleMyOrderBox = { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.45)", borderWidth: 1, borderRadius: radius.md, padding: 12, flexDirection: "row", alignItems: "center" };
// White cards with black text for the by-rider expand — max legibility for
// older riders in bright cafés and low-light morning starts.
const styleOrderName = { color: "#000", fontSize: 10, letterSpacing: 2, fontWeight: "900" };
const styleOrderText = { color: "#000", fontSize: 16, marginTop: 2, fontWeight: "600" };
const styleOrderRow = { backgroundColor: "rgba(255,255,255,0.96)", borderRadius: radius.md, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center" };
const styleUsualPill = { flexDirection: "column", alignItems: "flex-start", gap: 4, backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 };
const styleUsualPillLbl = { color: "#fff", fontSize: 10, letterSpacing: 2, fontWeight: "900", opacity: 0.9 };
const styleUsualPillTxt = { color: "#fff", fontSize: 17, fontWeight: "800" };
const styleInput = { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14 };
const styleSendBtn = { backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" };
const styleSendBtnTxt = { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 2 };
const styleHint = { color: "rgba(255,255,255,0.7)", fontSize: 10, letterSpacing: 2, fontWeight: "700" };
const styleCopyBar = { marginTop: 14, backgroundColor: "rgba(201,152,106,0.25)", borderColor: "rgba(201,152,106,0.55)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" };
const styleCopyBarTxt = { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 2 };
