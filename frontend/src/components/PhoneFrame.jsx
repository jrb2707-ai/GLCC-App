import React, { useEffect, useState } from "react";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 640px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 640px)");
    const listener = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isDesktop;
}

// Responsive shell: full viewport on mobile, stylised phone frame on tablet/desktop.
export default function PhoneFrame({ children }) {
  const isDesktop = useIsDesktop();

  if (!isDesktop) {
    return (
      // `transform-gpu` establishes this as a containing block so any
      // `fixed` descendants (member card, profile modal) scope to the
      // app shell instead of the raw viewport.
      <div className="fixed inset-0 bg-bg-primary text-text-primary flex flex-col overflow-hidden transform-gpu" data-testid="app-shell">
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative w-[402px] max-w-full h-[860px] max-h-[92vh] rounded-[46px] bg-black shadow-2xl overflow-hidden border-[6px] transform-gpu"
      style={{ borderColor: "var(--glcc-frame-bezel)" }}
      data-testid="app-shell"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-[120px] h-[26px] bg-black rounded-b-2xl" />
      <div className="relative h-full w-full bg-bg-primary text-text-primary flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
