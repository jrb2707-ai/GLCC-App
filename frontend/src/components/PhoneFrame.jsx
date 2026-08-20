import React from "react";

// Responsive shell: on mobile it fills the viewport with no phone bezel;
// on tablet/desktop it renders a stylised phone frame so the app still
// looks great as a preview.
export default function PhoneFrame({ children }) {
  return (
    <>
      {/* Mobile: full-bleed, no bezel */}
      <div className="sm:hidden fixed inset-0 bg-bg-primary text-text-primary flex flex-col overflow-hidden" data-testid="app-shell-mobile">
        {children}
      </div>

      {/* Tablet & desktop: phone frame */}
      <div
        className="hidden sm:block relative w-[402px] max-w-full h-[860px] max-h-[92vh] rounded-[46px] bg-black shadow-2xl overflow-hidden border-[6px]"
        style={{ borderColor: "var(--glcc-frame-bezel)" }}
        data-testid="phone-frame"
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-[120px] h-[26px] bg-black rounded-b-2xl" />
        <div className="relative h-full w-full bg-bg-primary text-text-primary flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
