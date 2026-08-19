import React from "react";
import { Toaster } from "sonner";
import { AppProviders, useAuth } from "./lib/store";
import PhoneFrame from "./components/PhoneFrame";
import AuthScreen from "./components/AuthScreen";
import HomeShell from "./components/HomeShell";

function Gate() {
  const { user, booted } = useAuth();
  if (!booted) {
    return (
      <div className="h-full w-full flex items-center justify-center text-text-secondary" data-testid="app-loading">
        <div className="font-mono-stat text-xs uppercase tracking-widest">Warming up the peloton…</div>
      </div>
    );
  }
  return user ? <HomeShell /> : <AuthScreen />;
}

export default function App() {
  return (
    <AppProviders>
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#05070b] py-6 md:py-10 px-3">
        <PhoneFrame>
          <Gate />
        </PhoneFrame>
        <div className="mt-4 text-[10px] uppercase tracking-[0.35em] text-text-muted font-mono-stat" data-testid="app-tagline">
          GLCC · 4th best cycle club in Grey Lynn
        </div>
      </div>
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
