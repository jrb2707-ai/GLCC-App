import React from "react";

// A stylized iPhone-like frame that keeps the app mobile-first in the browser preview.
export default function PhoneFrame({ children }) {
  return (
    <div
      className="relative w-[402px] max-w-full h-[860px] max-h-[92vh] rounded-[46px] bg-black shadow-2xl overflow-hidden border-[6px]"
      style={{ borderColor: "var(--glcc-frame-bezel)" }}
      data-testid="phone-frame"
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-[120px] h-[26px] bg-black rounded-b-2xl" />
      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 h-[26px] z-30 flex items-center justify-between px-6 text-[11px] font-mono-stat text-text-primary/90">
        <span>9:41</span>
        <span className="text-brand-accent">●</span>
      </div>
      <div className="relative h-full w-full bg-bg-primary text-text-primary flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
