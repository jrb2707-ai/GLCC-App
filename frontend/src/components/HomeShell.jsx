import React, { useEffect, useState } from "react";
import { Bike, Coffee, Users, MessageSquare, LogOut, Bell, BellOff, Sun, Moon, Monitor } from "lucide-react";
import { useAuth, useTheme, useEvents, browserPushSupported, browserPushPermission, requestBrowserPush } from "../lib/store";
import { api } from "../lib/api";
import { toast } from "sonner";
import RidesTab from "./tabs/RidesTab";
import CoffeeTab, { RoundDetailModal } from "./tabs/CoffeeTab";
import RidersTab from "./tabs/RidersTab";
import ChatTab from "./tabs/ChatTab";
import PendingBanner from "./PendingBanner";

// Global overlay: whenever a round is live and the user hasn't explicitly
// dismissed THIS round yet, we render the barista tally splash over any tab.
// Dismissal is per round.id and clears when a new round starts.
function LiveRoundOverlay() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [round, setRound] = useState(null);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/coffee/rounds/active");
        const first = (data.rounds || [])[0];
        if (!cancelled && first) setRound(first);
      } catch (_) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => subscribe((evt) => {
    if (!evt.round) return;
    if (evt.type === "coffee.round.started") {
      // Fresh round → clear dismissal for it (though it shouldn't be present).
      setDismissedIds((prev) => { const next = new Set(prev); next.delete(evt.round.id); return next; });
      setRound(evt.round);
    }
    if (evt.type === "coffee.round.updated") {
      setRound((cur) => (cur && cur.id === evt.round.id ? evt.round : cur));
    }
    if (evt.type === "coffee.round.closed") {
      setRound((cur) => (cur && cur.id === evt.round.id ? null : cur));
    }
  }), [subscribe]);

  if (!round || dismissedIds.has(round.id)) return null;
  return (
    <RoundDetailModal
      round={round}
      usual={user?.coffee}
      onChange={(next) => setRound(next)}
      onClose={() => setDismissedIds((prev) => new Set(prev).add(round.id))}
    />
  );
}

const TABS = [
  { id: "rides", label: "Rides", icon: Bike, activeClass: "text-accent-strava" },
  { id: "coffee", label: "Coffee", icon: Coffee, activeClass: "text-accent-pink" },
  { id: "riders", label: "Riders", icon: Users, activeClass: "text-black dark:text-white" },
  { id: "chat", label: "Chat", icon: MessageSquare, activeClass: "text-[#007AFF]" },
];

export default function HomeShell() {
  const [tab, setTab] = useState("coffee");
  const { user, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();
  const [perm, setPerm] = useState(browserPushPermission());
  const swipeRef = React.useRef({ x: 0, y: 0, active: false });

  const changeTab = (dir) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    const next = TABS[Math.min(TABS.length - 1, Math.max(0, idx + dir))];
    if (next && next.id !== tab) setTab(next.id);
  };
  const onTouchStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    if (!swipeRef.current.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeRef.current.x;
    const dy = t.clientY - swipeRef.current.y;
    swipeRef.current.active = false;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      changeTab(dx < 0 ? 1 : -1);
    }
  };

  useEffect(() => {
    setPerm(browserPushPermission());
  }, []);

  async function togglePush() {
    if (!browserPushSupported()) {
      toast.error("Your browser doesn't support notifications");
      return;
    }
    if (perm === "granted") {
      toast("Notifications are on — silence them from your browser settings");
      return;
    }
    const next = await requestBrowserPush();
    setPerm(next);
    if (next === "granted") {
      localStorage.setItem("glcc_push_banner_dismissed", "1");
      toast("Push notifications enabled", { description: "Coffee rounds and @mentions will ping you" });
    } else if (next === "denied") {
      localStorage.setItem("glcc_push_banner_dismissed", "1");
      toast.error("Notifications blocked — enable them in browser settings");
    }
  }

  const bellEnabled = perm === "granted";
  const BellIcon = bellEnabled ? Bell : BellOff;

  return (
    <div className="relative h-full w-full flex flex-col" data-testid="home-shell">
      {/* Header */}
      <div className="pt-9 pb-3 px-5 flex items-center justify-between border-b border-border-subtle bg-bg-primary/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-pink" />
          <span className="font-heading text-xl font-black uppercase tracking-wider">GLCC.</span>
          {user?.is_admin && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-bold bg-accent-volt/15 text-brand-accent border border-accent-volt/30">
              {user.is_president ? "El Prez" : "Admin"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user?.is_admin && (
            <button
              onClick={cycleTheme}
              title={`Theme: ${theme} — tap to cycle`}
              className="p-1.5 rounded-full text-text-secondary hover:text-brand-accent border border-transparent hover:border-border-subtle transition"
              data-testid="theme-toggle"
              aria-label={`Theme: ${theme}`}
            >
              {theme === "light" ? <Sun className="w-4 h-4" /> : theme === "dark" ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={togglePush}
            title={bellEnabled ? "Notifications on" : "Enable notifications"}
            className={`p-1.5 rounded-full transition ${
              bellEnabled
                ? "text-brand-accent bg-accent-volt/10 border border-accent-volt/30"
                : "text-text-secondary hover:text-brand-accent border border-transparent"
            }`}
            data-testid="notifications-toggle"
          >
            <BellIcon className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-secondary hover:text-brand-accent"
            data-testid="logout-button"
          >
            <LogOut className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar"
        data-testid="tab-content"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* No AnimatePresence wait: mount the new tab instantly with its
            own skeleton so we never render the previous tab's content
            under the new tab-bar highlight. */}
        <PendingBanner />
        <div
          key={tab}
          className={tab === "chat" ? "h-full" : "min-h-full"}
        >
          {tab === "rides" && <RidesTab onNavigate={setTab} />}
          {tab === "coffee" && <CoffeeTab onNavigate={setTab} />}
          {tab === "riders" && <RidersTab />}
          {tab === "chat" && <ChatTab />}
        </div>
      </div>

      {/* Global live-round barista splash. Renders over any tab so the
          peloton can't miss a shout regardless of where they're browsing. */}
      <LiveRoundOverlay />

      {/* Tab bar */}
      <div className="border-t border-border-subtle bg-bg-secondary/95 backdrop-blur-xl px-2 pt-2 pb-6">
        <div className="flex justify-around">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const activeCls = t.activeClass || "text-brand-accent";
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex flex-col items-center gap-1 py-1.5 px-3 group"
                data-testid={`tab-${t.id}`}
              >
                <Icon
                  className={`w-6 h-6 transition-colors ${
                    active ? activeCls : "text-text-muted group-hover:text-text-secondary"
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={`text-[10px] font-mono-stat uppercase tracking-widest ${
                    active ? activeCls : "text-text-muted"
                  }`}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
