import React, { useEffect, useRef, useState } from "react";
import { Settings, Bell, Mail, LogOut, Wrench, Coffee, MessageCircle } from "lucide-react";
import { useAuth, useTheme, useEvents, browserPushPermission, requestBrowserPush } from "../lib/store";
import { api } from "../lib/api";
import { toast } from "sonner";

// GLCC top header — matches the Field Notes № 03 mockup.
// Left: cog icon → Settings popover (notification toggles + display picker).
// Right: mail (DMs), bell (notification feed), Exit.
// Both popovers use the same pink 1px border language established in the
// Coffee tab.
export default function Header({ onOpenDM, dmUnread, notifPrefs, onPrefsChange }) {
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [feed, setFeed] = useState({ items: [], unread: 0 });
  const { subscribe } = useEvents();

  // Refresh the bell feed on mount + on any live club event that would
  // add to it. Debounced trivially by only re-fetching when the popover
  // gets opened, plus a background refresh every 60s.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (!cancelled) setFeed(data);
      } catch (_) { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 60000);
    const unsub = subscribe((evt) => {
      if (["chat.mechanical", "chat.mechanical.resolved", "coffee.round.started", "chat.mention"].includes(evt.type)) {
        refresh();
      }
    });
    return () => { cancelled = true; clearInterval(id); unsub && unsub(); };
  }, [user, subscribe]);

  async function openBell() {
    setBellOpen((v) => !v);
    if (!bellOpen) {
      try { await api.post("/notifications/read"); } catch (_) { /* ignore */ }
      setFeed((f) => ({ ...f, unread: 0 }));
    }
  }

  return (
    <div className="relative flex items-center justify-between px-4 py-3 border-b border-border-subtle">
      {/* Left — cog only (wordmark now lives on the login screen) */}
      <button
        onClick={() => { setSettingsOpen((v) => !v); setBellOpen(false); }}
        className={`p-1.5 rounded-full transition ${settingsOpen ? "text-accent-pink" : "text-text-secondary hover:text-brand-accent"}`}
        title="Settings"
        aria-label="Settings"
        data-testid="header-cog"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Right — mail · bell · Exit */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenDM}
          className="relative p-1.5 rounded-full text-text-secondary hover:text-brand-accent transition"
          title="Messages"
          aria-label="Messages"
          data-testid="dm-open"
        >
          <Mail className="w-[18px] h-[18px]" />
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
          onClick={() => { openBell(); setSettingsOpen(false); }}
          className={`relative p-1.5 rounded-full transition ${bellOpen || feed.unread > 0 ? "text-accent-pink" : "text-text-secondary hover:text-brand-accent"}`}
          title="Notifications"
          aria-label="Notifications"
          data-testid="header-bell"
        >
          <Bell className="w-[18px] h-[18px]" />
          {feed.unread > 0 && !bellOpen && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent-pink ring-2 ring-bg-primary" />
          )}
        </button>
        <button
          onClick={logout}
          className="text-[11px] text-text-muted font-mono-stat uppercase tracking-widest hover:text-status-cant"
          data-testid="header-exit"
        >
          Exit ↗
        </button>
      </div>

      {settingsOpen && (
        <SettingsPopover
          notifPrefs={notifPrefs}
          onPrefsChange={onPrefsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {bellOpen && (
        <NotificationsPopover items={feed.items} onClose={() => setBellOpen(false)} />
      )}
    </div>
  );
}

function SettingsPopover({ notifPrefs, onPrefsChange, onClose }) {
  const { theme, cycleTheme, setTheme } = useTheme();
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const toggle = async (key) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    onPrefsChange(next);  // optimistic
    try {
      const { data } = await api.put("/users/me/notification-prefs", { [key]: next[key] });
      onPrefsChange(data.notification_prefs || next);
      // If they turn Coffee/Chat/DM on but browser perm isn't granted, offer it.
      if (next[key] && browserPushPermission() === "default") {
        requestBrowserPush().catch(() => {});
      }
    } catch (_) {
      onPrefsChange(notifPrefs); // rollback
      toast.error("Couldn't save");
    }
  };

  const rows = [
    { key: "mechanical", label: "Mechanical alerts", sub: "Recommended", icon: Wrench },
    { key: "coffee", label: "Coffee rounds", sub: null, icon: Coffee },
    { key: "chat", label: "Club chat", sub: null, icon: MessageCircle },
    { key: "dm", label: "Private messages", sub: null, icon: Mail },
  ];

  return (
    <div
      ref={ref}
      className="absolute top-12 left-3 w-[240px] z-50 bg-bg-secondary border border-accent-pink rounded-2xl shadow-2xl p-3.5 animate-in fade-in zoom-in-95 duration-150"
      data-testid="settings-popover"
    >
      <div className="absolute -top-1.5 left-4 w-3 h-3 bg-bg-secondary border-l border-t border-accent-pink rotate-45" />
      <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink mb-2.5 px-1">Settings</div>
      <div className="rounded-xl bg-bg-primary border border-border-subtle overflow-hidden">
        {rows.map((r, i) => {
          const Icon = r.icon;
          const on = !!notifPrefs?.[r.key];
          return (
            <button
              key={r.key}
              onClick={() => toggle(r.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${i > 0 ? "border-t border-border-subtle" : ""}`}
              data-testid={`pref-${r.key}`}
            >
              <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text-primary truncate">{r.label}</div>
                {r.sub && <div className="text-[10px] font-mono-stat text-text-muted uppercase tracking-widest">{r.sub}</div>}
              </div>
              <div className={`relative w-9 h-5 rounded-full transition ${on ? "bg-accent-pink" : "bg-bg-secondary border border-border-subtle"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mt-3 mb-1.5 px-1">Display</div>
      <div className="flex bg-bg-primary rounded-xl p-1 gap-1">
        {["auto", "dark", "light"].map((opt) => (
          <button
            key={opt}
            onClick={() => setTheme(opt)}
            className={`flex-1 text-[12px] font-semibold capitalize py-1.5 rounded-lg ${theme === opt ? "bg-accent-pink text-white" : "text-text-secondary"}`}
            data-testid={`theme-${opt}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotificationsPopover({ items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const iconFor = (kind) => {
    if (kind === "mechanical") return { icon: Wrench, cls: "bg-status-cant/15 text-status-cant" };
    if (kind === "coffee") return { icon: Coffee, cls: "bg-accent-pink/15 text-accent-pink" };
    return { icon: MessageCircle, cls: "bg-[#007AFF]/15 text-[#007AFF]" };
  };

  return (
    <div
      ref={ref}
      className="absolute top-12 right-16 w-[264px] z-50 bg-bg-secondary border border-accent-pink rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150"
      data-testid="notifications-popover"
    >
      <div className="absolute -top-1.5 right-4 w-3 h-3 bg-bg-secondary border-l border-t border-accent-pink rotate-45" />
      <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink mb-1 px-2 py-1">Notifications</div>
      <div className="max-h-[360px] overflow-y-auto no-scrollbar">
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">All quiet</div>
        )}
        {items.map((it) => {
          const { icon: Icon, cls } = iconFor(it.kind);
          return (
            <div key={it.id} className="relative flex gap-2.5 px-2 py-2 border-b border-border-subtle last:border-b-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-text-primary leading-tight">
                  <b className="font-semibold">{it.title}</b> {it.subtitle}
                </div>
                <div className="text-[10px] text-text-muted font-mono-stat mt-0.5">{fmtRelative(it.created_at)}</div>
              </div>
              {it.unread && <div className="absolute right-2 top-3 w-1.5 h-1.5 rounded-full bg-accent-pink" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtRelative(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
