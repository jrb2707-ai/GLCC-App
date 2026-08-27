import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Bare-bones SVG icons matching the Field Notes № 03 mockup exactly.
// Colour + stroke width driven by props so callers can flip the icon
// tint when a popover is open (accent pink) or a badge is present.
const strokeProps = (color, width) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
});

export function CogIcon({ size = 20, color = "#c9d1d9" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="3" {...strokeProps(color, 1.75)} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}

export function MailIcon({ size = 18, color = "#c9d1d9" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="5" width="18" height="14" rx="2" {...strokeProps(color, 1.75)} />
      <Path d="M3 7l9 6 9-6" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}

export function BellIcon({ size = 18, color = "#c9d1d9" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9z" {...strokeProps(color, 1.75)} />
      <Path d="M10 20a2 2 0 0 0 4 0" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}

export function WrenchIcon({ size = 14, color = "#8b949e" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}

export function CoffeeIcon({ size = 14, color = "#8b949e" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 8h1a4 4 0 0 1 0 8h-1" {...strokeProps(color, 1.75)} />
      <Path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" {...strokeProps(color, 1.75)} />
      <Path d="M6 1v3M10 1v3M14 1v3" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}

export function ChatBubbleIcon({ size = 14, color = "#8b949e" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}

export function TrashIcon({ size = 14, color = "#fff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" {...strokeProps(color, 1.75)} />
    </Svg>
  );
}
