import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors, radius } from "../constants/theme";
import { useAuth, useEvents, useLiveRound } from "../lib/store";
import { api } from "../lib/api";
import RidesTab from "../tabs/RidesTab";
import CoffeeTab, { RoundDetailBody } from "../tabs/CoffeeTab";
import RidersTab from "../tabs/RidersTab";
import ChatTab from "../tabs/ChatTab";
import DMScreen from "./DMScreen";
import Header, { NotificationPrompt } from "../components/Header";
import Watermarks from "../components/Watermarks";

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
                  secondary={user?.secondary_coffee}
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

// Wraps each tab screen with its per-tab watermark background. React Native
// doesn't do CSS `background`, so we render the mark absolutely behind the
// tab body.
function withWatermark(tabKey, Component) {
  return function Wrapped(props) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
        <Watermarks tab={tabKey} />
        <View style={{ flex: 1, backgroundColor: "transparent" }}>
          <Component {...props} />
        </View>
      </View>
    );
  };
}
const RidesWithMark = withWatermark("rides", RidesTab);
const CoffeeWithMark = withWatermark("coffee", CoffeeTab);
const RidersWithMark = withWatermark("riders", RidersTab);
const ChatWithMark = withWatermark("chat", ChatTab);

export default function HomeShell() {
  const { user, refreshMe } = useAuth();
  const { subscribe } = useEvents();
  const [dmOpen, setDmOpen] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
  const [notifPrefs, setNotifPrefs] = useState(user?.notification_prefs || { mechanical: true, coffee: true, chat: true, dm: true });
  const [showPrompt, setShowPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState("Coffee"); // matches initialRouteName below
  const navRef = React.useRef(createNavigationContainerRef()).current;

  // First-time modal: show once, then let has_seen_notification_prompt stay
  // truthy so it never resurfaces on subsequent logins on this device.
  useEffect(() => {
    if (user && !user.has_seen_notification_prompt) setShowPrompt(true);
    if (user?.notification_prefs) setNotifPrefs(user.notification_prefs);
  }, [user]);

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
      if (evt.type === "dm.message" || evt.type === "dm.read" || evt.type === "dm.deleted") {
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
      <Header
        onOpenDM={() => setDmOpen(true)}
        dmUnread={dmUnread}
        notifPrefs={notifPrefs}
        onPrefsChange={setNotifPrefs}
        onNavigate={(tabName) => { try { navRef.navigate(tabName); } catch (_) {} }}
        activeTab={activeTab}
      />
      <NavigationContainer
        ref={navRef}
        theme={NavTheme}
        independent
        onStateChange={() => setActiveTab(navRef.getCurrentRoute()?.name)}
      >
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
          <Tab.Screen name="Rides" component={RidesWithMark} options={{ tabBarActiveTintColor: colors.stravaOrange }} />
          <Tab.Screen name="Coffee" component={CoffeeWithMark} options={{ tabBarActiveTintColor: colors.accentPink }} />
          <Tab.Screen name="Riders" component={RidersWithMark} />
          <Tab.Screen name="Chat" component={ChatWithMark} />
        </Tab.Navigator>
      </NavigationContainer>
      <LiveRoundOverlay />
      <DMScreen visible={dmOpen} onClose={() => setDmOpen(false)} />
      <NotificationPrompt
        visible={showPrompt}
        onDone={(saved) => { setNotifPrefs(saved); setShowPrompt(false); refreshMe?.(); }}
      />
    </SafeAreaView>
  );
}
