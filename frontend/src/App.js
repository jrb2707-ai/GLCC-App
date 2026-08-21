import React, { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { AppProviders, useAuth } from "./lib/store";
import PhoneFrame from "./components/PhoneFrame";
import AuthScreen from "./components/AuthScreen";
import HomeShell from "./components/HomeShell";
import ResetPasswordScreen from "./components/ResetPasswordScreen";
import RidePreviewScreen from "./components/RidePreviewScreen";

function useResetToken() {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return { token: null };
    const url = new URL(window.location.href);
    if (url.pathname === "/reset-password" && url.searchParams.get("token")) {
      return { token: url.searchParams.get("token") };
    }
    return { token: null };
  });
  const clear = () => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/");
    }
    setState({ token: null });
  };
  return [state.token, clear];
}

function useRidePreviewId() {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return { id: null };
    const m = /^\/(?:r|ride|rides)\/([a-zA-Z0-9]+)/.exec(window.location.pathname);
    return { id: m ? m[1] : null };
  });
  const clear = () => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/");
    }
    setState({ id: null });
  };
  return [state.id, clear];
}

function Gate() {
  const { user, booted } = useAuth();
  const [resetToken, clearReset] = useResetToken();
  const [previewRideId, clearPreview] = useRidePreviewId();
  useEffect(() => {}, []);
  if (resetToken) {
    return <ResetPasswordScreen token={resetToken} onDone={clearReset} />;
  }
  // Unauthed share preview — visible to logged-in AND logged-out visitors
  // so a rider tapping the email link doesn't lose their spot.
  if (previewRideId && !user) {
    return <RidePreviewScreen rideId={previewRideId} onSignIn={clearPreview} />;
  }
  if (!booted) {
    return (
      <div className="relative h-full w-full overflow-hidden" data-testid="app-loading">
        <img
          src="https://images.unsplash.com/photo-1758300620054-f42cf6e5458f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHw0fHxyb2FkJTIwY3ljbGlzdCUyMGdyb3VwJTIwcGVsb3RvbnxlbnwwfHx8fDE3ODcxODA5NzF8MA&ixlib=rb-4.1.0&q=85"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-bg-primary/85 to-bg-primary" />
        <div className="relative h-full w-full flex flex-col items-center justify-center px-8 text-center">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block w-3 h-3 rounded-full bg-accent-volt pulse-volt" />
            <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-white">
              Grey Lynn Cycle Club
            </span>
          </div>
          <div className="font-heading text-[72px] leading-none font-black uppercase text-white">
            GLCC
          </div>
          <p className="mt-2 text-white text-xs max-w-[240px]">
            4th best cycle club in Grey Lynn.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-accent-volt/30 border-t-accent-volt animate-spin" />
            <div className="font-mono-stat text-[10px] uppercase tracking-widest text-white">
              Warming up the peloton…
            </div>
          </div>
        </div>
      </div>
    );
  }
  return user ? <HomeShell /> : <AuthScreen />;
}

function AppShell() {
  const [isDesktop, setIsDesktop] = React.useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 640px)").matches;
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 640px)");
    const l = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", l);
    return () => mq.removeEventListener("change", l);
  }, []);

  if (isDesktop) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center py-6 md:py-10 px-3" style={{ background: "var(--glcc-shell-bg)" }}>
        <PhoneFrame>
          <Gate />
        </PhoneFrame>
        <div className="mt-4 text-[10px] uppercase tracking-[0.35em] text-text-muted font-mono-stat" data-testid="app-tagline">
          GLCC · 4th best cycle club in Grey Lynn
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--glcc-shell-bg)" }}>
      <PhoneFrame>
        <Gate />
      </PhoneFrame>
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppShell />
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          style: {
            background: "#0D1117",
            color: "#F0F6FC",
            border: "1px solid #30363D",
          },
        }}
      />
    </AppProviders>
  );
}
