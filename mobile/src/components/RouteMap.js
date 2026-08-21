import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, radius } from "../constants/theme";

// Renders the Strava map thumbnail when available, otherwise a stylised
// polyline so a ride card always feels alive.
export default function RouteMap({ name, mapUrl, height = 160 }) {
  if (mapUrl) {
    return (
      <View style={[s.wrap, { height }]} testID="route-map">
        <Image source={{ uri: mapUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        <View style={s.badge}>
          <Text style={s.badgeText}>ROUTE · {String(name || "").toUpperCase()}</Text>
        </View>
      </View>
    );
  }
  const seed = (name || "GLCC").length;
  const points = Array.from({ length: 8 }, (_, i) => {
    const x = 20 + i * 42;
    const y = 60 + Math.sin((i + seed) * 0.9) * 26 + (i % 2 === 0 ? -6 : 6);
    return `${x},${y}`;
  });
  const [firstY] = points[0].split(",");
  const [lastY] = points[7].split(",");
  return (
    <View style={[s.wrap, { height: 140, backgroundColor: "#181c22" }]} testID="route-map">
      <Svg viewBox="0 0 340 140" width="100%" height="100%">
        <Defs>
          <LinearGradient id="rg" x1="0" x2="1">
            <Stop offset="0" stopColor={colors.accentVolt} />
            <Stop offset="1" stopColor={colors.stravaOrange} />
          </LinearGradient>
        </Defs>
        <Polyline
          points={points.join(" ")}
          fill="none"
          stroke="url(#rg)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={20} cy={parseFloat(points[0].split(",")[1])} r={5} fill={colors.accentVolt} />
        <Circle cx={314} cy={parseFloat(points[7].split(",")[1])} r={5} fill={colors.stravaOrange} />
      </Svg>
      <View style={s.badge}>
        <Text style={[s.badgeText, { color: colors.textSecondary }]}>ROUTE · {String(name || "").toUpperCase()}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: "#000" },
  badge: { position: "absolute", left: 12, bottom: 8, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: "#fff", fontSize: 9, letterSpacing: 3, fontWeight: "700" },
});
