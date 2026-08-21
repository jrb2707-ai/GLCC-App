import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { colors } from "../constants/theme";

const SIZES = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 64,
};

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Avatar({ name, photo, size = "md", tint = "volt", testID }) {
  const dim = SIZES[size] || SIZES.md;
  const bg = tint === "pink" ? colors.accentPink : "rgba(212,255,0,0.15)";
  const fg = tint === "pink" ? "#fff" : colors.accentVolt;
  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={[s.img, { width: dim, height: dim, borderRadius: dim / 2 }]}
        testID={testID}
      />
    );
  }
  return (
    <View
      style={[s.wrap, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bg }]}
      testID={testID}
    >
      <Text style={{ color: fg, fontWeight: "900", fontSize: dim * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderSubtle },
  img: { borderWidth: 1, borderColor: colors.borderSubtle },
});
