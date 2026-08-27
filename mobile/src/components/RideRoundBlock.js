import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
  Alert, ScrollView, Clipboard, AppState,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents, useLiveRound } from "../lib/store";
import { colors, radius, spacing } from "../constants/theme";
import Avatar from "./Avatar";

function normalizeOrder(text) {
  return (text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Inline tally used under the "You're shouting" card. Auto-scales the font
// size based on how many distinct orders exist so the whole tally fits.
function InlineTally({ orders }) {
  const groups = new Map();
  for (const o of orders) {
    const key = normalizeOrder(o.text);
    if (!key) continue;
    const g = groups.get(key) || { display: o.text.trim(), riders: [] };
    g.riders.push(o.name);
    groups.set(key, g);
  }
  const rows = Array.from(groups.values()).sort((a, b) => b.riders.length - a.riders.length);
  if (!rows.length) return null;
  const n = rows.length;
  const sz = n <= 3 ? { row: 12, count: 32, name: 16, riders: 11 }
    : n <= 6 ? { row: 10, count: 26, name: 14, riders: 10 }
    : n <= 10 ? { row: 8, count: 22, name: 13, riders: 10 }
    : { row: 6, count: 18, name: 12, riders: 9 };
  return (
    <View>
      {rows.map((g) => (
        <View key={g.display} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: sz.row }}>
          <Text style={{ color: colors.accentPink, fontSize: sz.count, fontWeight: "900", width: 60, lineHeight: sz.count }}>{g.riders.length}×</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: "#fff", fontSize: sz.name, fontWeight: "800", lineHeight: sz.name + 4 }}>{g.display}</Text>
            <Text style={{ color: "#fff", fontSize: sz.riders, letterSpacing: 1.5, fontWeight: "700", marginTop: 2 }} numberOfLines={2}>{g.riders.join(" · ").toUpperCase()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}


function useCountdown(iso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return { text: "", seconds: 0, expired: true };
  const target = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((target - now) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return { text: `${mm}:${ss}`, seconds: secs, expired: secs <= 0 };
}

export default function RideRoundBlock({ ride }) {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const { open: openLiveRound, round: globalLiveRound } = useLiveRound();
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orderText, setOrderText] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetchRound = async () => {
      try {
        const { data } = await api.get(`/rides/${ride.id}/round`);
        if (!cancelled) setRound(data.round);
      } catch (_) { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchRound();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchRound();
    });
    return () => { cancelled = true; sub?.remove?.(); };
  }, [ride.id]);

  // Refetch on tab focus so a round started on another screen (or missed
  // over a dropped WebSocket) shows up the moment the user lands here.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/rides/${ride.id}/round`);
        if (!cancelled) setRound(data.round);
      } catch (_) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [ride.id]));

  useEffect(() => subscribe((evt) => {
    if (!evt.round || evt.round.ride_id !== ride.id) return;
    if (["coffee.round.started", "coffee.round.updated", "coffee.round.closed"].includes(evt.type)) {
      setRound(evt.round);
    }
  }), [subscribe, ride.id]);

  const myOrder = useMemo(
    () => round?.orders?.find((o) => o.user_id === user?.id),
    [round, user],
  );
  const countdown = useCountdown(round?.close_at);
  const closed = !!round?.closed || countdown.expired;

  useEffect(() => {
    if (myOrder?.text) setOrderText(myOrder.text);
  }, [myOrder?.text]);

  async function startRound() {
    setBusy(true);
    try {
      const cafeName = ride.cafe || "Café";
      const { data } = await api.post(`/rides/${ride.id}/round`, {
        cafe_name: cafeName, close_in_seconds: 300,
      });
      setRound(data);
      // Auto-slot the buyer's saved usual so they never have to confirm
      // their coffee twice. Silent fail if the round POST raced — buyer
      // can still tap the "usual" pill inside the tally splash.
      const usualText = (user?.coffee || "").trim();
      let latestRound = data;
      if (usualText) {
        try {
          const { data: withOrder } = await api.post(`/rides/${ride.id}/round/order`, { text: usualText });
          latestRound = withOrder;
          setRound(withOrder);
        } catch (_) { /* soft-fail */ }
      }
      // Force-open the global barista tally splash for the buyer.
      try { openLiveRound(latestRound); } catch (_) { /* ignore */ }
    } catch (e) { Alert.alert("Round", formatDetail(e)); }
    finally { setBusy(false); }
  }

  async function submitOrder(textOverride) {
    const text = (textOverride ?? orderText).trim();
    if (!text) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/rides/${ride.id}/round/order`, { text });
      setRound(data);
      setOrderText(text);
    } catch (e) { Alert.alert("Order", formatDetail(e)); }
    finally { setBusy(false); }
  }

  async function retractOrder() {
    setBusy(true);
    try {
      const { data } = await api.delete(`/rides/${ride.id}/round/order`);
      setRound(data);
      setOrderText("");
    } catch (e) { Alert.alert("Order", formatDetail(e)); }
    finally { setBusy(false); }
  }

  async function closeRound() {
    setBusy(true);
    try {
      const { data } = await api.post(`/rides/${ride.id}/round/close`);
      setRound(data);
    } catch (e) { Alert.alert("Round", formatDetail(e)); }
    finally { setBusy(false); }
  }

  function copyList() {
    if (!round?.orders?.length) return;
    const text = round.orders.map((o) => `${o.name}: ${o.text}`).join("\n");
    Clipboard.setString(text);
    Alert.alert("Copied", "Order list copied — hand it to the barista.");
  }

  if (loading) {
    return <View style={[s.wrap, { height: 90, backgroundColor: colors.bgSecondary }]} />;
  }

  const isBuyer = round?.buyer_user_id === user?.id;
  const usual = user?.coffee;

  // No round → single-action CTA at the bottom
  if (!round || (closed && !round?.closed_manually_at)) {
    const cafeName = ride.cafe;
    // If a round is already running on another ride, funnel this rider
    // straight into that live tally instead of starting a competing shout.
    const alternate = globalLiveRound && globalLiveRound.ride_id !== ride.id && !globalLiveRound.closed ? globalLiveRound : null;
    if (alternate) {
      return (
        <View style={s.ctaWrap} testID="ride-round-block">
          <Text style={s.ctaEyebrow}>☕ ROUND IN PROGRESS · {(alternate.buyer_name || "").toUpperCase()}</Text>
          <TouchableOpacity onPress={() => openLiveRound(alternate)} style={[s.ctaBuy, { flex: undefined }]} testID="round-add-my-coffee">
            <Text style={s.ctaBuyTxt}>☕ ADD MY COFFEE</Text>
          </TouchableOpacity>
          <Text style={s.hint}>OPENS {(alternate.buyer_name || "").toUpperCase()}'S TALLY · SAME 5-MIN WINDOW</Text>
        </View>
      );
    }
    return (
      <View style={s.ctaWrap} testID="ride-round-block">
        <Text style={s.ctaEyebrow}>☕ COFFEE AT {(cafeName || "THE CAFÉ").toUpperCase()}</Text>
        <TouchableOpacity onPress={startRound} disabled={busy} style={[s.ctaBuy, { flex: undefined }, busy && { opacity: 0.5 }]} testID="round-start">
          <Text style={s.ctaBuyTxt}>☕ I'M BUYING</Text>
        </TouchableOpacity>
        <Text style={s.hint}>SHOUT DROPS A 5-MIN PUSH · YOUR USUAL AUTO-LOCKS IN</Text>
      </View>
    );
  }

  return (
    <View style={s.wrap} testID="ride-round-block">
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <Avatar name={round.buyer_name} photo={round.buyer_photo} size="md" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.eyebrow}>{isBuyer ? "YOU'RE SHOUTING" : `${(round.buyer_name || "").toUpperCase()}'S SHOUT`}</Text>
          <Text style={s.cafeName} numberOfLines={1} testID="round-cafe-name">{round.cafe_name}</Text>
          {round.cafe_address ? (
            <Text style={s.cafeAddr} numberOfLines={1}>{round.cafe_address}</Text>
          ) : null}
        </View>
      </View>

      {!closed && (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={s.hint}>ORDERS CLOSE IN</Text>
            <Text style={s.countdown} testID="round-countdown">{countdown.text}</Text>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, (countdown.seconds / 300) * 100))}%` }]} />
          </View>
        </View>
      )}

      {/* Live barista tally — sits right under the shouter's card so the
          buyer never has to hunt for who's ordered what. */}
      {!closed && round.orders.length > 0 && (
        <View style={s.liveTallyWrap} testID="round-live-tally">
          <Text style={s.liveTallyEye}>☕ BARISTA TALLY · {round.orders.length} ORDER{round.orders.length === 1 ? "" : "S"}</Text>
          <InlineTally orders={round.orders} />
        </View>
      )}

      {closed ? (
        <View style={s.lockedBox} testID="round-locked">
          <Text style={[s.eyebrow, { color: colors.accentCoffee, marginBottom: 6 }]}>
            LOCKED · {round.orders.length} ORDER{round.orders.length === 1 ? "" : "S"}
          </Text>
          <ScrollView style={{ maxHeight: 260 }}>
            {round.orders.map((o) => (
              <View key={o.user_id} style={s.orderRow}>
                <Avatar name={o.name} photo={o.photo} size="xs" />
                <View style={{ flex: 1, marginLeft: 8, minWidth: 0 }}>
                  <Text style={s.orderName}>{(o.name || "").toUpperCase()}</Text>
                  <Text style={s.orderText}>{o.text}</Text>
                </View>
              </View>
            ))}
            {round.orders.length === 0 && <Text style={s.hint}>No orders in.</Text>}
          </ScrollView>
          <TouchableOpacity onPress={copyList} style={s.copyBtn} testID="round-copy">
            <Text style={s.copyBtnTxt}>COPY LIST</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ marginTop: 14 }}>
          {myOrder ? (
            <View style={s.myOrderBox} testID="round-my-order">
              <Text style={s.myOrderEye}>YOUR ORDER</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.myOrderText} numberOfLines={2}>{myOrder.text}</Text>
                <TouchableOpacity onPress={retractOrder} disabled={busy} testID="round-retract">
                  <Text style={s.retractTxt}>UNDO</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              {usual ? (
                <TouchableOpacity
                  onPress={() => submitOrder(usual)}
                  disabled={busy}
                  style={s.usualBtn}
                  testID="round-usual"
                >
                  <Text style={s.usualLbl}>TAP TO ORDER MY USUAL</Text>
                  <Text style={s.usualTxt} numberOfLines={2}>☕  {usual}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={orderText}
                  onChangeText={setOrderText}
                  placeholder="Flat white, no sugar…"
                  placeholderTextColor={colors.textMuted}
                  style={s.input}
                  maxLength={140}
                  testID="round-order-input"
                  onSubmitEditing={() => submitOrder()}
                />
                <TouchableOpacity
                  onPress={() => submitOrder()}
                  disabled={busy || !orderText.trim()}
                  style={[s.sendBtn, (busy || !orderText.trim()) && { opacity: 0.4 }]}
                  testID="round-submit"
                >
                  <Text style={s.sendBtnTxt}>SEND</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[s.hint, { marginTop: 12 }]}>
            {round.orders.length} ORDER{round.orders.length === 1 ? "" : "S"} SO FAR
          </Text>
          {round.orders.map((o) => (
            <View key={o.user_id} style={s.orderRow}>
              <Avatar name={o.name} photo={o.photo} size="xs" />
              <View style={{ flex: 1, marginLeft: 8, minWidth: 0 }}>
                <Text style={s.orderName}>{(o.name || "").toUpperCase()}</Text>
                <Text style={s.orderText}>{o.text}</Text>
              </View>
            </View>
          ))}

          {isBuyer && (
            <TouchableOpacity onPress={closeRound} disabled={busy} style={s.closeEarly} testID="round-close-early">
              <Text style={s.closeEarlyTxt}>CLOSE EARLY</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 20, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(201,152,106,0.30)", backgroundColor: "rgba(44,30,24,0.6)" },
  ctaWrap: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  ctaEyebrow: { color: colors.accentPink, fontSize: 10, letterSpacing: 2, fontWeight: "900", marginBottom: 10 },
  ctaRow: { flexDirection: "row", gap: 8 },
  ctaBuy: { flex: 1, backgroundColor: colors.accentPink, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  ctaBuyTxt: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  ctaSkip: { flex: 1, backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  ctaSkipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  eyebrow: { color: colors.accentCoffee, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  cafeName: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 2 },
  cafeAddr: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  primaryBtn: { marginTop: 12, backgroundColor: colors.accentPink, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  primaryBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 3 },
  hint: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center", marginTop: 6 },
  countdown: { color: colors.accentPink, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  barTrack: { height: 4, backgroundColor: colors.borderSubtle, borderRadius: 999, marginTop: 4, overflow: "hidden" },
  barFill: { height: 4, backgroundColor: colors.accentPink },
  myOrderBox: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.35)", borderWidth: 1, borderRadius: radius.md, padding: 10 },
  liveTallyWrap: { marginTop: 14, backgroundColor: "rgba(0,0,0,0.4)", borderColor: "rgba(201,152,106,0.5)", borderWidth: 1, borderRadius: radius.md, padding: 14 },
  liveTallyEye: { color: colors.accentCoffee, fontSize: 10, letterSpacing: 2, fontWeight: "900", marginBottom: 10 },
  myOrderEye: { color: "#16a34a", fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 2 },
  myOrderText: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  retractTxt: { color: colors.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, paddingHorizontal: 4 },
  usualBtn: { flexDirection: "column", alignItems: "flex-start", gap: 4, backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
  usualLbl: { color: "#fff", fontSize: 10, letterSpacing: 2, fontWeight: "900", opacity: 0.9 },
  usualTxt: { color: "#fff", fontSize: 17, fontWeight: "800", flex: 1 },
  input: { flex: 1, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14 },
  sendBtn: { backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  sendBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  orderRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.20)", borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: 8, marginTop: 6 },
  orderName: { color: "#fff", fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  orderText: { color: "#fff", fontSize: 13, marginTop: 1 },
  closeEarly: { marginTop: 14, borderColor: "rgba(239,68,68,0.4)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  closeEarlyTxt: { color: "#dc2626", fontSize: 10, letterSpacing: 3, fontWeight: "900" },
  lockedBox: { marginTop: 12, backgroundColor: "rgba(0,0,0,0.35)", borderColor: "rgba(201,152,106,0.30)", borderWidth: 1, borderRadius: radius.md, padding: 10 },
  copyBtn: { marginTop: 10, backgroundColor: "rgba(201,152,106,0.15)", borderColor: "rgba(201,152,106,0.40)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  copyBtnTxt: { color: colors.accentCoffee, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
});
