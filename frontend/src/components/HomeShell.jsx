import React, { useEffect, useState } from "react";
import { Bike, Coffee, Users, MessageSquare } from "lucide-react";
import { useAuth, useTheme, useEvents, useLiveRound } from "../lib/store";
import { api } from "../lib/api";
import { toast } from "sonner";
import RidesTab from "./tabs/RidesTab";
import CoffeeTab, { RoundDetailModal } from "./tabs/CoffeeTab";
import RidersTab from "./tabs/RidersTab";
import ChatTab from "./tabs/ChatTab";
import PendingBanner from "./PendingBanner";
import DMDrawer from "./DMDrawer";
import Header from "./Header";
import NotificationPrompt from "./NotificationPrompt";

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
  const [dmOpen, setDmOpen] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
  const [notifPrefs, setNotifPrefs] = useState(user?.notification_prefs || { mechanical: true, coffee: true, chat: true, dm: true });
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => {
    if (user && !user.has_seen_notification_prompt) {
      setShowPrompt(true);
    }
    if (user?.notification_prefs) setNotifPrefs(user.notification_prefs);
  }, [user]);
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

  return (
    <div className="relative h-full w-full flex flex-col" data-testid="home-shell">
      <Header
        onOpenDM={() => setDmOpen(true)}
        dmUnread={dmUnread}
        notifPrefs={notifPrefs}
        onPrefsChange={setNotifPrefs}
      />

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar"
        data-testid="tab-content"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
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

      {/* First-time notification-preferences prompt */}
      {showPrompt && (
        <NotificationPrompt onDone={(saved) => { setNotifPrefs(saved); setShowPrompt(false); }} />
      )}

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
