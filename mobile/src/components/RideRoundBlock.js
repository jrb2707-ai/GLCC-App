import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
  Alert, ScrollView, Clipboard,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import { colors, radius, spacing } from "../constants/theme";
import Avatar from "./Avatar";

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
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orderText, setOrderText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/rides/${ride.id}/round`);
        if (!cancelled) setRound(data.round);
      } catch (_) { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [ride.id]);

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

  // No round → start CTA
  if (!round || (closed && !round?.closed_manually_at)) {
    const cafeName = ride.cafe;
    return (
      <View style={s.wrap} testID="ride-round-block">
        <Text style={s.eyebrow}>☕ CAFÉ STOP</Text>
        <Text style={s.cafeName}>{cafeName || "Café TBC"}</Text>
        <TouchableOpacity onPress={startRound} disabled={busy} style={s.primaryBtn} testID="round-start">
          <Text style={s.primaryBtnTxt}>{busy ? "…" : "☕ I'M BUYING — START ROUND"}</Text>
        </TouchableOpacity>
        <Text style={s.hint}>Everyone gets 5 min to order</Text>
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
                  <Text style={s.usualLbl}>USUAL →</Text>
                  <Text style={s.usualTxt} numberOfLines={1}>{usual}</Text>
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
  myOrderEye: { color: "#16a34a", fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 2 },
  myOrderText: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  retractTxt: { color: colors.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, paddingHorizontal: 4 },
  usualBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderColor: "rgba(252,82,0,0.4)", borderWidth: 1, backgroundColor: "rgba(252,82,0,0.10)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  usualLbl: { color: colors.accentStrava, fontSize: 10, letterSpacing: 2, fontWeight: "900" },
  usualTxt: { color: colors.textPrimary, fontSize: 13, flex: 1 },
  input: { flex: 1, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14 },
  sendBtn: { backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  sendBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  orderRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.20)", borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: 8, marginTop: 6 },
  orderName: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  orderText: { color: colors.textPrimary, fontSize: 13, marginTop: 1 },
  closeEarly: { marginTop: 14, borderColor: "rgba(239,68,68,0.4)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  closeEarlyTxt: { color: "#dc2626", fontSize: 10, letterSpacing: 3, fontWeight: "900" },
  lockedBox: { marginTop: 12, backgroundColor: "rgba(0,0,0,0.35)", borderColor: "rgba(201,152,106,0.30)", borderWidth: 1, borderRadius: radius.md, padding: 10 },
  copyBtn: { marginTop: 10, backgroundColor: "rgba(201,152,106,0.15)", borderColor: "rgba(201,152,106,0.40)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  copyBtnTxt: { color: colors.accentCoffee, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
});
