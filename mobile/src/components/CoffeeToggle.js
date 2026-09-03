import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { colors, radius, spacing } from "../constants/theme";

// Default/Secondary picker for a single coffee order. Local to whichever
// button renders it — switching here only changes what THIS order submits,
// never the rider's saved defaults (those live in Profile). Secondary is
// genuinely unpressable (not just dimmed) until the rider has one saved.
export default function CoffeeToggle({ value, onChange, secondary, testID = "coffee-toggle" }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.xs }} testID={testID}>
      <TouchableOpacity
        onPress={() => onChange("default")}
        style={{
          flex: 1,
          paddingVertical: 8,
          borderRadius: radius.md,
          borderWidth: 1,
          alignItems: "center",
          backgroundColor: value === "default" ? "rgba(255,45,149,0.15)" : colors.bgPrimary,
          borderColor: value === "default" ? colors.accentPink : colors.borderSubtle,
        }}
        testID={`${testID}-default`}
      >
        <Text style={{
          fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase",
          color: value === "default" ? colors.accentPink : colors.textMuted,
        }}>
          Default
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => secondary && onChange("secondary")}
        disabled={!secondary}
        style={{
          flex: 1,
          paddingVertical: 8,
          borderRadius: radius.md,
          borderWidth: 1,
          alignItems: "center",
          opacity: secondary ? 1 : 0.6,
          backgroundColor: secondary && value === "secondary" ? "rgba(255,45,149,0.15)" : colors.bgPrimary,
          borderColor: secondary && value === "secondary" ? colors.accentPink : colors.borderSubtle,
        }}
        testID={`${testID}-secondary`}
      >
        <Text style={{
          fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase",
          color: secondary && value === "secondary" ? colors.accentPink : colors.textMuted,
        }}>
          {secondary ? "Secondary" : "Add in Profile"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
