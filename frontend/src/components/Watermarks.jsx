import React from "react";
import { COFFEE_WATERMARK_URI, RIDES_WATERMARK_URI } from "../assets/watermarks";

// Faint per-tab watermarks pulled straight from the Field Notes № 03 mockup.
// Rendered as absolute background layers so they sit behind the scroll
// content without competing with it. Each mark occupies the top or bottom
// half of the phone frame with a linear-gradient mask fading it into the
// canvas — exactly as the mockup specifies (bottom-heavy for Coffee/Rides,
// centered for Riders/Chat).
export default function Watermarks({ tab }) {
  if (tab === "coffee") {
    return (
      <div
        aria-hidden="true"
        data-testid="wm-coffee"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 overflow-hidden z-0"
      >
        <img
          src={COFFEE_WATERMARK_URI}
          alt=""
          className="absolute left-1/2 -translate-x-1/2 -top-3 w-[110%] max-w-none"
          style={{
            opacity: 0.32,
            WebkitMaskImage:
              "linear-gradient(to bottom, black 40%, rgba(0,0,0,0.35) 65%, transparent 90%)",
            maskImage:
              "linear-gradient(to bottom, black 40%, rgba(0,0,0,0.35) 65%, transparent 90%)",
          }}
        />
      </div>
    );
  }
  if (tab === "rides") {
    return (
      <div
        aria-hidden="true"
        data-testid="wm-rides"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 overflow-hidden z-0"
      >
        <img
          src={RIDES_WATERMARK_URI}
          alt=""
          className="absolute left-1/2 -translate-x-1/2 -bottom-5 w-[135%] max-w-none"
          style={{
            opacity: 0.24,
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 30%, black 65%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 30%, black 65%)",
          }}
        />
      </div>
    );
  }
  if (tab === "riders") {
    // Race-bib dossard, "1021" — carries the kit design across the app.
    return (
      <div
        aria-hidden="true"
        data-testid="wm-riders"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-0"
      >
        <svg
          viewBox="0 0 100 130"
          className="w-[280px] h-[364px]"
          style={{
            opacity: 0.13,
            stroke: "var(--accent-cant, #EF4444)",
            fill: "none",
            strokeWidth: 1.6,
            transform: "rotate(-6deg)",
          }}
        >
          <rect x="6" y="6" width="88" height="118" rx="4" />
          <circle cx="18" cy="16" r="2.2" fill="#FF2D95" stroke="none" />
          <circle cx="82" cy="16" r="2.2" fill="#FF2D95" stroke="none" />
          <line x1="14" y1="34" x2="86" y2="34" />
          <text
            x="50" y="26"
            fontSize="9" fontWeight="800" textAnchor="middle"
            letterSpacing="1"
            fill="var(--accent-cant, #EF4444)" stroke="none"
            fontFamily="'Archivo', system-ui, sans-serif"
          >GLCC</text>
          <text
            x="50" y="88"
            fontSize="38" fontWeight="900" textAnchor="middle"
            fill="var(--accent-cant, #EF4444)" stroke="none"
            fontFamily="'Archivo', system-ui, sans-serif"
          >1021</text>
          <line x1="14" y1="102" x2="86" y2="102" />
          <text
            x="50" y="116"
            fontSize="6.5" fontWeight="600" textAnchor="middle"
            letterSpacing="1.5"
            fill="var(--accent-cant, #EF4444)" stroke="none"
            fontFamily="'Archivo', system-ui, sans-serif"
          >GREY LYNN CC</text>
        </svg>
      </div>
    );
  }
  if (tab === "chat") {
    // Giant rotated GLCC wordmark — pulled from the mockup verbatim.
    return (
      <div
        aria-hidden="true"
        data-testid="wm-chat"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-0"
      >
        <span
          className="font-heading font-black whitespace-nowrap select-none"
          style={{
            fontSize: "120px",
            color: "#007AFF",
            opacity: 0.08,
            transform: "rotate(-18deg)",
            letterSpacing: "0.02em",
          }}
        >GLCC</span>
      </div>
    );
  }
  return null;
}
