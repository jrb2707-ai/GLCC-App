import React, { useEffect, useState } from "react";
import { Bike, Coffee, Users, MessageSquare, LogOut, Bell, BellOff, Sun, Moon, Monitor, Mail } from "lucide-react";
import { useAuth, useTheme, useEvents, useLiveRound, browserPushSupported, browserPushPermission, requestBrowserPush } from "../lib/store";
import { api } from "../lib/api";
import { toast } from "sonner";
import RidesTab from "./tabs/RidesTab";
import CoffeeTab, { RoundDetailModal } from "./tabs/CoffeeTab";
import RidersTab from "./tabs/RidersTab";
import ChatTab from "./tabs/ChatTab";
import PendingBanner from "./PendingBanner";
import DMDrawer from "./DMDrawer";

// Global overlay: mirrors the shared LiveRoundContext state. Any tab can
// force-open (via `useLiveRound().open()`) or dismiss. Dismissal is scoped
// to the round.id so a fresh shout resurfaces the splash.
function LiveRoundOverlay() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const { round, setRound, open, dismiss, isVisible } = useLiveRound();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/coffee/rounds/active");
        const first = (data.rounds || [])[0];
        if (!cancelled && first) open(first);
      } catch (_) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => subscribe((evt) => {
    if (!evt.round) return;
    if (evt.type === "coffee.round.started") {
      // New round → force open (clears any prior dismissal for a new id).
      open(evt.round);
    }
    if (evt.type === "coffee.round.updated") {
      setRound((cur) => (cur && cur.id === evt.round.id ? evt.round : cur));
    }
    if (evt.type === "coffee.round.closed") {
      setRound((cur) => (cur && cur.id === evt.round.id ? null : cur));
    }
  }), [subscribe, open, setRound]);

  if (!isVisible || !round) return null;
  return (
    <RoundDetailModal
      round={round}
      usual={user?.coffee}
      onChange={(next) => setRound(next)}
      onClose={dismiss}
    />
  );
}

const TABS = [
  { id: "rides", label: "Rides", icon: Bike, activeClass: "text-accent-strava" },
  { id: "coffee", label: "Coffee", icon: Coffee, activeClass: "text-accent-pink" },
  // Riders active tint is derived at render time from the effective theme
  // so it flips to red when the app is in dark mode (either via the admin
  // theme picker or OS auto-dark).
  { id: "riders", label: "Riders", icon: Users, activeClass: null },
  { id: "chat", label: "Chat", icon: MessageSquare, activeClass: "text-[#007AFF]" },
];

// Resolve the theme picker's setting (auto/light/dark) into a concrete
// boolean so tab tints can react to both explicit choice and OS preference.
function useEffectiveDark(theme) {
  const [prefersDark, setPrefersDark] = useState(() => (
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  ));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setPrefersDark(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return prefersDark;
}

export default function HomeShell() {
  const [tab, setTab] = useState("coffee");
  const { user, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();
  const { subscribe } = useEvents();
  const isDark = useEffectiveDark(theme);
  const ridersActiveCls = isDark ? "text-status-cant" : "text-black";
  const [perm, setPerm] = useState(browserPushPermission());
  const [dmOpen, setDmOpen] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
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

  // Hydrate DM unread badge on login and keep it live via WS. `dm.message`
  // arriving for me from anyone → bump. `dm.read` → recompute from source.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/dm/unread");
        if (!cancelled) setDmUnread(data.unread_total || 0);
      } catch (_) { /* ignore */ }
    })();
    const unsub = subscribe(async (evt) => {
      if (evt.type === "dm.message" || evt.type === "dm.read") {
        try {
          const { data } = await api.get("/dm/unread");
          setDmUnread(data.unread_total || 0);
        } catch (_) { /* ignore */ }
      }
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, [user, subscribe]);

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
            <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-bold border ${user.is_president ? "bg-accent-pink/15 text-accent-pink border-accent-pink/40" : "bg-accent-volt/15 text-brand-accent border-accent-volt/30"}`}>
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
            onClick={() => setDmOpen(true)}
            title="Messages"
            className="relative p-1.5 rounded-full text-text-secondary hover:text-brand-accent border border-transparent hover:border-border-subtle transition"
            data-testid="dm-open"
            aria-label="Open messages"
          >
            <Mail className="w-4 h-4" />
            {dmUnread > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent-pink text-white text-[9px] font-black flex items-center justify-center leading-none"
                data-testid="dm-badge"
              >
                {dmUnread > 9 ? "9+" : dmUnread}
              </span>
            )}
          </button>
          <button
            onClick={togglePush}
            title={bellEnabled ? "Notifications on" : "Enable notifications"}
            className={`p-1.5 rounded-full transition ${
              bellEnabled
                ? "text-accent-pink bg-accent-pink/10 border border-accent-pink/30"
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

      {/* Rider-to-rider DMs */}
      <DMDrawer open={dmOpen} onClose={() => setDmOpen(false)} />

      {/* Tab bar */}
      <div className="border-t border-border-subtle bg-bg-secondary/95 backdrop-blur-xl px-2 pt-2 pb-6">
        <div className="flex justify-around">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const activeCls = (t.id === "riders" ? ridersActiveCls : t.activeClass) || "text-brand-accent";
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
