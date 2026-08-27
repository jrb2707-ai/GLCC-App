import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Svg, { Rect, Circle, Line, Text as SvgText } from "react-native-svg";
import { COFFEE_WATERMARK_URI, RIDES_WATERMARK_URI } from "../assets/watermarks";
import { colors } from "../constants/theme";

// Native counterpart of the web Watermarks component. Each mark sits as
// an absolute-fill background inside the tab and the tab's real content
// scrolls above it.
export default function Watermarks({ tab }) {
  if (tab === "coffee") {
    return (
      <View pointerEvents="none" style={s.wrap} testID="wm-coffee">
        <Image
          source={{ uri: COFFEE_WATERMARK_URI }}
          style={[s.coffeeImg, { opacity: 0.24 }]}
          resizeMode="cover"
        />
      </View>
    );
  }
  if (tab === "rides") {
    return (
      <View pointerEvents="none" style={s.wrap} testID="wm-rides">
        <Image
          source={{ uri: RIDES_WATERMARK_URI }}
          style={[s.ridesImg, { opacity: 0.20 }]}
          resizeMode="cover"
        />
      </View>
    );
  }
  if (tab === "riders") {
    return (
      <View pointerEvents="none" style={[s.wrap, s.center]} testID="wm-riders">
        <View style={{ transform: [{ rotate: "-6deg" }], opacity: 0.13 }}>
          <Svg width={260} height={338} viewBox="0 0 100 130">
            <Rect x={6} y={6} width={88} height={118} rx={4} stroke={colors.statusCant} fill="none" strokeWidth={1.6} />
            <Circle cx={18} cy={16} r={2.2} fill={colors.accentPink} />
            <Circle cx={82} cy={16} r={2.2} fill={colors.accentPink} />
            <Line x1={14} y1={34} x2={86} y2={34} stroke={colors.statusCant} strokeWidth={1.6} />
            <SvgText x={50} y={26} fontSize={9} fontWeight="800" textAnchor="middle" fill={colors.statusCant}>GLCC</SvgText>
            <SvgText x={50} y={90} fontSize={38} fontWeight="900" textAnchor="middle" fill={colors.statusCant}>1021</SvgText>
            <Line x1={14} y1={102} x2={86} y2={102} stroke={colors.statusCant} strokeWidth={1.6} />
            <SvgText x={50} y={116} fontSize={6.5} fontWeight="600" textAnchor="middle" fill={colors.statusCant}>GREY LYNN CC</SvgText>
          </Svg>
        </View>
      </View>
    );
  }
  if (tab === "chat") {
    return (
      <View pointerEvents="none" style={[s.wrap, s.center]} testID="wm-chat">
        <Text style={s.chatMark}>GLCC</Text>
      </View>
    );
  }
  return null;
}

const s = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", zIndex: 0 },
  center: { alignItems: "center", justifyContent: "center" },
  coffeeImg: { position: "absolute", top: -10, left: -20, right: -20, height: "55%" },
  ridesImg: { position: "absolute", bottom: -10, left: -40, right: -40, height: "65%" },
  chatMark: {
    fontSize: 120,
    fontWeight: "900",
    color: "#007AFF",
    opacity: 0.08,
    letterSpacing: 2,
    transform: [{ rotate: "-18deg" }],
  },
});
