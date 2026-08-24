import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors } from "../constants/theme";
import { useAuth } from "../lib/store";
import RidesTab from "../tabs/RidesTab";
import CoffeeTab from "../tabs/CoffeeTab";
import RidersTab from "../tabs/RidersTab";
import ChatTab from "../tabs/ChatTab";

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

function Header() {
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
      <TouchableOpacity onPress={logout}>
        <Text style={s.exit}>EXIT</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeShell() {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <Header />
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
  badge: { backgroundColor: "rgba(212,255,0,0.15)", borderColor: "rgba(212,255,0,0.30)", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: colors.accentVolt, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  exit: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
});
