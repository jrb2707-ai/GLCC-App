import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors, radius } from "../constants/theme";
import { useAuth, useEvents, useLiveRound } from "../lib/store";
import { api } from "../lib/api";
import RidesTab from "../tabs/RidesTab";
import CoffeeTab, { RoundDetailBody } from "../tabs/CoffeeTab";
import RidersTab from "../tabs/RidersTab";
import ChatTab from "../tabs/ChatTab";
import DMScreen from "./DMScreen";

function LiveRoundOverlay() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const { round, setRound, open, dismiss, isVisible } = useLiveRound();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/coffee/rounds/active");
        const first = (data.rounds || [])[0];
        if (!cancelled && first) open(first);
      } catch (_) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => subscribe((evt) => {
    if (!evt.round) return;
    if (evt.type === "coffee.round.started") open(evt.round);
    if (evt.type === "coffee.round.updated") {
      setRound((cur) => (cur && cur.id === evt.round.id ? evt.round : cur));
    }
    if (evt.type === "coffee.round.closed") {
      setRound((cur) => (cur && cur.id === evt.round.id ? null : cur));
    }
  }), [subscribe, open, setRound]);

  return (
    <Modal visible={!!isVisible && !!round} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={overlayStyles.bg}>
        <View style={overlayStyles.card}>
          <ImageBackground
            source={{ uri: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=60" }}
            style={{ flex: 1 }}
            resizeMode="cover"
          >
            <ScrollView style={overlayStyles.overlay} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={overlayStyles.handle} />
              {round && (
                <RoundDetailBody
                  round={round}
                  onChange={setRound}
                  onClose={dismiss}
                  usual={user?.coffee}
                  subscribe={subscribe}
                />
              )}
            </ScrollView>
          </ImageBackground>
        </View>
      </View>
    </Modal>
  );
}

const overlayStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  card: { height: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", backgroundColor: "#1a1210" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 20 },
  handle: { alignSelf: "center", width: 48, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.4)", marginBottom: 12 },
});

const Tab = createBottomTabNavigator();

const NavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bgPrimary,
    card: colors.bgPrimary,
    text: colors.textPrimary,
    primary: colors.accentVolt,
    border: colors.borderSubtle,
  },
};

function Header({ onOpenDM, dmUnread }) {
  const { user, logout } = useAuth();
  return (
    <View style={s.header}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={s.pinkDot} />
        <Text style={s.logo}>GLCC.</Text>
        {user?.is_president && (
          <View style={s.badge}>
            <Text style={s.badgeText}>EL PREZ</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <TouchableOpacity onPress={onOpenDM} testID="dm-open" style={{ padding: 4 }}>
          <Text style={{ fontSize: 18 }}>✉️</Text>
          {dmUnread > 0 ? (
            <View style={s.headerBadge} testID="dm-badge">
              <Text style={s.headerBadgeTxt}>{dmUnread > 9 ? "9+" : String(dmUnread)}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={logout}>
          <Text style={s.exit}>EXIT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeShell() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [dmOpen, setDmOpen] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);

  // Hydrate DM unread badge + refresh on every dm.message / dm.read event.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/dm/unread");
        if (!cancelled) setDmUnread(data.unread_total || 0);
      } catch (_) { /* ignore */ }
    })();
    const unsub = subscribe(async (evt) => {
      if (evt.type === "dm.message" || evt.type === "dm.read") {
        try {
          const { data } = await api.get("/dm/unread");
          setDmUnread(data.unread_total || 0);
        } catch (_) { /* ignore */ }
      }
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, [user, subscribe]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <Header onOpenDM={() => setDmOpen(true)} dmUnread={dmUnread} />
      <NavigationContainer theme={NavTheme} independent>
        <Tab.Navigator
          initialRouteName="Coffee"
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: colors.bgSecondary, borderTopColor: colors.borderSubtle, height: 72, paddingBottom: 12, paddingTop: 8 },
            tabBarLabelStyle: { fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
            tabBarActiveTintColor: colors.accentVolt,
            tabBarInactiveTintColor: colors.textMuted,
          }}
        >
          <Tab.Screen name="Rides" component={RidesTab} options={{ tabBarActiveTintColor: colors.stravaOrange }} />
          <Tab.Screen name="Coffee" component={CoffeeTab} options={{ tabBarActiveTintColor: colors.accentPink }} />
          <Tab.Screen name="Riders" component={RidersTab} />
          <Tab.Screen name="Chat" component={ChatTab} />
        </Tab.Navigator>
      </NavigationContainer>
      <LiveRoundOverlay />
      <DMScreen visible={dmOpen} onClose={() => setDmOpen(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pinkDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentPink },
  logo: { color: colors.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  badge: { backgroundColor: "rgba(236,72,153,0.15)", borderColor: "rgba(236,72,153,0.40)", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: colors.accentPink, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  exit: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  headerBadge: { position: "absolute", top: -2, right: -6, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.accentPink, alignItems: "center", justifyContent: "center" },
  headerBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "900" },
});
