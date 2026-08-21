import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, ImageBackground, Modal,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { useAuth } from "../lib/store";
import { colors, radius, spacing, COFFEES } from "../constants/theme";
import Avatar from "../components/Avatar";
import { timeAgo } from "../lib/util";

const HERO = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&q=80";

export default function CoffeeTab() {
  const { user } = useAuth();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState(false);
  const [coffee, setCoffee] = useState(user?.coffee || "Medium Flat White");
  const isPending = user?.status === "pending";

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/coffee/rounds");
      setRounds(data.rounds || []);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send(override) {
    if (sending) return;
    const c = override || user?.coffee || coffee;
    setSending(true);
    try {
      const { data } = await api.post("/coffee/rounds", { coffee: c });
      Alert.alert("Round sent", `${data.coffee} · The peloton hears you`);
      setModal(false);
      await load();
    } catch (e) {
      Alert.alert("Coffee round", formatDetail(e));
    } finally { setSending(false); }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accentPink} /></View>;

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const today = rounds.filter((r) => r.created_at && new Date(r.created_at) >= startOfToday);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accentPink} />}
    >
      <ImageBackground source={{ uri: HERO }} style={s.hero} imageStyle={{ opacity: 0.85 }}>
        <View style={s.heroScrim} />
        <View style={s.heroContent}>
          <Text style={s.heroEyebrow}>✦ KM'S DESERVE CAFFEINE</Text>
          <Text style={s.heroTitle}>Coffee Order</Text>
        </View>
      </ImageBackground>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: -16 }}>
        <TouchableOpacity
          onPress={() => send()}
          disabled={sending || isPending}
          style={[s.orderBtn, (sending || isPending) && { opacity: 0.5 }]}
          testID="coffee-send-round-button"
        >
          {sending && <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />}
          <Text style={s.orderTxt}>☕ ORDER MY COFFEE</Text>
        </TouchableOpacity>
        <Text style={s.orderMeta}>
          {isPending ? "AWAITING ADMIN APPROVAL" : `SENDS ${(user?.coffee || "").toUpperCase()}`}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: 24 }}>
        <Text style={s.sectionLabel}>TODAY'S COFFEE ORDERS</Text>
        {today.length === 0 && (
          <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 12, paddingVertical: 24 }}>
            Silent morning. Someone stand up.
          </Text>
        )}
        {today.map((r) => (
          <View key={r.id} style={s.row} testID={`coffee-round-${r.id}`}>
            <Avatar name={r.rider_name || r.name} photo={r.rider_photo || null} size="sm" tint="pink" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.rowName}>{r.rider_name || r.name}</Text>
              <Text style={s.rowCoffee}>{r.coffee}</Text>
            </View>
            <Text style={s.rowTime}>{timeAgo(r.created_at)}</Text>
          </View>
        ))}
      </View>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetEyebrow}>SEND A COFFEE ROUND</Text>
            <Text style={s.sheetTitle}>Your coffee</Text>
            <ScrollView style={{ maxHeight: 320, marginTop: 12 }}>
              <View style={s.coffeeGrid}>
                {COFFEES.map((c) => {
                  const active = coffee === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCoffee(c)}
                      style={[s.coffeeChip, active && s.coffeeChipActive]}
                    >
                      <Text style={[s.coffeeChipTxt, active && { color: colors.accentPink }]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setModal(false)} style={s.ghostBtn}>
                <Text style={s.ghostTxt}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => send(coffee)} style={s.sendBtn}>
                <Text style={s.sendTxt}>SEND TO GROUP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: "center", justifyContent: "center" },
  hero: { height: 220, justifyContent: "flex-end" },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  heroContent: { padding: spacing.lg, paddingBottom: 32 },
  heroEyebrow: { color: colors.accentCoffee, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  heroTitle: { color: colors.textPrimary, fontSize: 36, fontWeight: "900", letterSpacing: -1, marginTop: 4, textTransform: "uppercase" },

  orderBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", backgroundColor: colors.accentPink, borderRadius: radius.lg, paddingVertical: 14, shadowColor: colors.accentPink, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  orderTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  orderMeta: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700", textAlign: "center", marginTop: 8 },

  sectionLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: 8 },
  rowName: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  rowCoffee: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  rowTime: { color: colors.textMuted, fontSize: 10, letterSpacing: 1, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34, maxHeight: "80%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, marginBottom: 12 },
  sheetEyebrow: { color: colors.accentPink, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  sheetTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, marginTop: 4 },
  coffeeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coffeeChip: { width: "48%", paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgPrimary },
  coffeeChipActive: { borderColor: colors.accentPink, backgroundColor: "rgba(255,45,149,0.10)" },
  coffeeChipTxt: { color: colors.textSecondary, fontSize: 12 },
  ghostBtn: { flex: 1, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  ghostTxt: { color: colors.textSecondary, letterSpacing: 2, fontWeight: "700", fontSize: 12 },
  sendBtn: { flex: 1, backgroundColor: colors.accentPink, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  sendTxt: { color: "#fff", letterSpacing: 2, fontWeight: "900", fontSize: 12 },
});
