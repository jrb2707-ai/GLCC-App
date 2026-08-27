import React from "react";
import { View, ActivityIndicator, StatusBar as RNStatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, ThemeProvider, LiveRoundProvider, useAuth } from "./src/lib/store";
import AuthScreen from "./src/screens/AuthScreen";
import HomeShell from "./src/screens/HomeShell";
import { colors } from "./src/constants/theme";

function Gate() {
  const { user, booted } = useAuth();
  if (!booted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accentVolt} />
      </View>
    );
  }
  return user ? <HomeShell /> : <AuthScreen />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ThemeProvider>
          <AuthProvider>
            <LiveRoundProvider>
              <Gate />
            </LiveRoundProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
