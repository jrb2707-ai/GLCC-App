import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import { colors, radius, spacing } from "../constants/theme";
import Avatar from "../components/Avatar";
import StravaPanel from "../components/StravaPanel";
import RouteMap from "../components/RouteMap";
import { readCache, writeCache } from "../lib/cache";

const RSVP_OPTIONS = [
  { key: "going", label: "Going", color: colors.statusGoing },
  { key: "maybe", label: "Maybe", color: colors.statusMaybe },
  { key: "no", label: "Can't go", color: colors.statusCant },
];

function goingList(ride, riders) {
  const ids = Object.entries(ride.rsvps || {})
    .filter(([, v]) => v === "going")
    .map(([id]) => id);
  return ids.map((id) => riders.find((r) => r.id === id)).filter(Boolean);
}

export default function RidesTab() {
  const { user, pendingRideId, consumePendingRide } = useAuth();
  const { subscribe } = useEvents();
  const [rides, setRides] = useState([]);
  const [riders, setRiders] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [routeExpanded, setRouteExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const isPending = user?.status === "pending";

  const load = useCallback(async () => {
    try {
      const [rr, us] = await Promise.all([api.get("/rides"), api.get("/riders")]);
      setRides(rr.data.rides || []);
      setRiders(us.data.riders || []);
      writeCache("rides", rr.data.rides || []);
      writeCache("riders", us.data.riders || []);
      setErr("");
    } catch (e) {
      setErr(formatDetail(e));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => {
    // Warm from cache so the ride list appears instantly at the start line
    (async () => {
      const [cachedRides, cachedRiders] = await Promise.all([readCache("rides"), readCache("riders")]);
      if (cachedRides) setRides(cachedRides);
      if (cachedRiders) setRiders(cachedRiders);
      if (cachedRides || cachedRiders) setLoading(false);
    })();
    load();
  }, [load]);

  // Deep-link / push-tap → jump straight into the ride detail. If the ride
  // hasn't loaded yet (cold start from a killed app), refresh once and try
  // again once the list arrives.
  useEffect(() => {
    if (!pendingRideId) return;
    if (rides.some((r) => r.id === pendingRideId)) {
      setOpenId(pendingRideId);
      consumePendingRide();
    } else if (!loading) {
      consumePendingRide();
    }
  }, [pendingRideId, rides, loading, consumePendingRide]);

  // WS-driven live updates for rides + riders + strava sync completion.
  useEffect(() => {
    return subscribe((evt) => {
      if ((evt.type === "ride.updated" || evt.type === "ride.created") && evt.ride) {
        setRides((prev) => {
          const idx = prev.findIndex((r) => r.id === evt.ride.id);
          if (idx === -1) return [...prev, evt.ride];
          const next = [...prev]; next[idx] = evt.ride; return next;
        });
      }
      if (evt.type === "ride.deleted" && evt.ride_id) {
        setRides((prev) => prev.filter((r) => r.id !== evt.ride_id));
      }
      if (evt.type === "rider.updated" && evt.rider?.id) {
        setRiders((prev) => {
          const idx = prev.findIndex((r) => r.id === evt.rider.id);
          if (idx === -1) return prev;
          const next = [...prev]; next[idx] = evt.rider; return next;
        });
      }
      if (evt.type === "rides.synced") load();
    });
  }, [subscribe, load]);

  useEffect(() => {
    // Reset route-description expansion when the user opens a different ride.
    setRouteExpanded(false);
  }, [openId]);

  async function setRsvp(rideId, status, _ride) {
    try {
      const { data } = await api.post(`/rides/${rideId}/rsvp`, { status });
      setRides((prev) => prev.map((r) => (r.id === rideId ? data : r)));
    } catch (e) {
      Alert.alert("RSVP", formatDetail(e));
    }
  }

  async function sendRound(ride) {
    try {
      const { data } = await api.post("/coffee/rounds", { ride_id: ride.id });
      Alert.alert("Round sent", `${data.coffee} · ${ride.cafe || "the group"}`);    } catch (e) {
      Alert.alert("Coffee", formatDetail(e));
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accentVolt} /></View>;

  const open = rides.find((r) => r.id === openId);

  if (open) {
    const myRsvp = open.rsvps?.[user?.id];
    const going = goingList(open, riders);
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bgPrimary }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}
      >
        <TouchableOpacity onPress={() => setOpenId(null)} style={s.backBtn} testID="ride-back">
          <Text style={s.backTxt}>← BACK TO RIDES</Text>
        </TouchableOpacity>

        <Text style={s.detailEyebrow}>{[open.day, open.date, open.time].filter(Boolean).join(" · ") || "TBC"}</Text>
        <Text style={s.detailTitle}>{open.name}</Text>
        {!!open.route && (
          <TouchableOpacity
            onPress={() => setRouteExpanded((v) => !v)}
            activeOpacity={open.route_description ? 0.7 : 1}
            disabled={!open.route_description}
            testID="ride-route-line"
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap" }}>
              <Text style={s.detailRoute}>{open.route}</Text>
              {!!open.route_description && (
                <Text style={s.routeChevron}> {routeExpanded ? "▲" : "▼"}</Text>
              )}
            </View>
            {routeExpanded && !!open.route_description && (
              <Text style={s.routeDescription} testID="ride-route-description">
                {open.route_description}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <View style={s.statsRow}>
          <StatCell label="Distance" value={open.distance || "—"} />
          <StatCell label="Elevation" value={open.elevation || "—"} />
          <StatCell label="Pace" value={open.pace || "—"} />
        </View>

        <Text style={s.locLine}>📍 {open.location ? `Depart ${open.location}` : "Location TBC"}</Text>

        <View style={{ marginTop: 16 }}>
          <RouteMap name={open.name} mapUrl={open.map_url} />
        </View>

        <Text style={s.sectionLabel}>YOUR RSVP {isPending && <Text style={{ color: colors.statusMaybe }}>· locked until approval</Text>}</Text>
        <View style={s.rsvpRow}>
          {RSVP_OPTIONS.map((o) => {
            const active = myRsvp === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                onPress={() => setRsvp(open.id, o.key, open)}
                disabled={isPending}
                style={[
                  s.rsvpBtn,
                  active && { borderColor: o.color, backgroundColor: hexAlpha(o.color, 0.15) },
                  isPending && { opacity: 0.4 },
                ]}
                testID={`rsvp-${o.key}-button`}
              >
                <Text style={[s.rsvpTxt, active && { color: o.color }]}>{o.label.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.cafe} testID="cafe-block">
          <Text style={s.cafeEyebrow}>☕ CAFÉ STOP</Text>
          <Text style={s.cafeName}>{open.cafe || "Café TBC"}</Text>
          <TouchableOpacity
            onPress={() => sendRound(open)}
            disabled={isPending}
            style={[s.cafeBtn, isPending && { opacity: 0.5 }]}
            testID="cafe-send-round-button"
          >
            <Text style={s.cafeBtnTxt}>I'M AT THE CAFÉ</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>GOING · {going.length}</Text>
        {going.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Nobody yet — be the first.</Text>}
        <View style={s.goingWrap}>
          {going.map((r) => (
            <View key={r.id} style={s.goingChip}>
              <Avatar name={r.name} photo={r.photo} size="xs" />
              <Text style={s.goingName}>{r.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accentVolt} />}
    >
      <StravaPanel onSynced={load} />
      <View style={s.headerRow}>
        <Text style={s.h1}>Rides Calendar</Text>
        <Text style={s.sub}>{rides.length} SCHEDULED</Text>
      </View>

      {err ? <Text style={s.err}>{err}</Text> : null}

      {rides.length === 0 && (
        <View style={s.empty}>
          <Text style={{ color: colors.textMuted, textAlign: "center" }}>No rides scheduled. Sync Strava to pull events.</Text>
        </View>
      )}

      {rides.map((r) => {
        const going = Object.values(r.rsvps || {}).filter((v) => v === "going").length;
        return (
          <TouchableOpacity
            key={r.id}
            onPress={() => setOpenId(r.id)}
            style={s.card}
            testID={`ride-card-${r.id}`}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <Text style={s.cardEyebrow}>{[r.day, r.date, r.time].filter(Boolean).join(" · ") || "TBC"}</Text>
              {r.source === "strava" && (
                <View style={s.stravaBadge}><Text style={s.stravaBadgeTxt}>Strava</Text></View>
              )}
            </View>
            <Text style={s.cardTitle}>{r.name}</Text>
            <View style={s.metaGrid}>
              <Text style={s.metaLine}>🛣  {r.distance || "—"}</Text>
              <Text style={s.metaLine}>⛰  {r.elevation || "—"}</Text>
            </View>
            {!!r.cafe && <Text style={s.cafeLine}>☕ {r.cafe}</Text>}
            <View style={s.cardFooter}>
              <Text style={s.footerStat}>{going} GOING</Text>
              <Text style={s.footerLoc} numberOfLines={1}>📍 {(r.location || "").split(",")[0] || "Location TBC"}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function StatCell({ label, value }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statLabel}>{label.toUpperCase()}</Text>
      <Text style={s.statVal}>{value}</Text>
    </View>
  );
}

function hexAlpha(hex, a) {
  // Simple #RRGGBB → rgba
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${a})`;
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  h1: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, textTransform: "uppercase" },
  sub: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  err: { color: colors.statusCant, marginTop: spacing.md, fontSize: 12 },
  empty: { padding: 20, marginTop: 20, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, borderStyle: "dashed" },

  card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: 10 },
  cardEyebrow: { color: colors.accentVolt, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  stravaBadge: { backgroundColor: "rgba(252,76,2,0.20)", borderColor: "rgba(252,76,2,0.40)", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
  stravaBadgeTxt: { color: colors.stravaOrange, fontSize: 9, fontWeight: "700" },
  cardTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "900", letterSpacing: -0.2, textTransform: "uppercase", marginTop: 6 },
  metaGrid: { flexDirection: "row", gap: 16, marginTop: 8 },
  metaLine: { color: colors.textSecondary, fontSize: 12 },
  cafeLine: { color: colors.accentCoffee, fontSize: 12, marginTop: 6 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  footerStat: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  footerLoc: { color: colors.textSecondary, fontSize: 11, flex: 1, textAlign: "right" },

  // Detail
  backBtn: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: 12 },
  backTxt: { color: colors.textPrimary, fontSize: 11, letterSpacing: 3, fontWeight: "700" },
  detailEyebrow: { color: colors.accentVolt, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  detailTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: "900", letterSpacing: -0.5, textTransform: "uppercase", marginTop: 4 },
  detailRoute: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  routeChevron: { color: colors.accentVolt, fontSize: 10, marginTop: 6, letterSpacing: 2, fontWeight: "700" },
  routeDescription: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  statCell: { flex: 1, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, padding: 10 },
  statLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  statVal: { color: colors.textPrimary, fontSize: 18, fontWeight: "900", marginTop: 4 },
  locLine: { color: colors.textSecondary, fontSize: 12, marginTop: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  rsvpRow: { flexDirection: "row", gap: 8 },
  rsvpBtn: { flex: 1, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgSecondary, paddingVertical: 10, borderRadius: radius.md, alignItems: "center" },
  rsvpTxt: { color: colors.textSecondary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },

  cafe: { marginTop: 20, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(201,152,106,0.30)", backgroundColor: "rgba(44,30,24,0.6)" },
  cafeEyebrow: { color: colors.accentCoffee, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  cafeName: { color: colors.textPrimary, fontSize: 20, fontWeight: "900", marginTop: 4 },
  cafeBtn: { marginTop: 10, backgroundColor: colors.accentPink, paddingVertical: 12, borderRadius: radius.md, alignItems: "center" },
  cafeBtnTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 12 },

  goingWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  goingChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle },
  goingName: { color: colors.textPrimary, fontSize: 12 },
});
