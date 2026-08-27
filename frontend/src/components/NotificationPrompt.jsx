import React, { useState } from "react";
import { Bell, Wrench, Coffee, MessageCircle, Mail } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

// Full-screen "Stay in the loop" prompt — shown the very first time
// after login while `has_seen_notification_prompt` is false. All rows
// default to ON (matches product decision: opt-out, not opt-in).
export default function NotificationPrompt({ onDone }) {
  const [prefs, setPrefs] = useState({
    mechanical: true, coffee: true, chat: true, dm: true,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api.put("/users/me/notification-prefs", {
        ...prefs, has_seen_notification_prompt: true,
      });
      onDone?.(prefs);
    } catch (e) {
      toast.error("Couldn't save preferences");
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    { key: "mechanical", label: "Mechanical alerts", sub: "Recommended — always on", icon: Wrench, locked: false },
    { key: "coffee", label: "Coffee rounds", sub: null, icon: Coffee },
    { key: "chat", label: "Club chat", sub: null, icon: MessageCircle },
    { key: "dm", label: "Private messages", sub: null, icon: Mail },
  ];

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" data-testid="notif-prompt">
      <div className="w-full max-w-[380px] bg-bg-secondary border border-accent-pink rounded-3xl p-6 shadow-2xl">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent-pink/15 flex items-center justify-center">
          <Bell className="w-6 h-6 text-accent-pink" />
        </div>
        <div className="text-center mb-5">
          <div className="font-heading text-xl font-black uppercase tracking-wider mb-2">Stay in the loop</div>
          <div className="text-[13px] text-text-secondary leading-relaxed max-w-[280px] mx-auto">
            Choose what the club can notify you about. You can change this anytime from the cog icon.
          </div>
        </div>
        <div className="rounded-2xl bg-bg-primary border border-border-subtle overflow-hidden">
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                onClick={() => setPrefs((p) => ({ ...p, [r.key]: !p[r.key] }))}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left ${i > 0 ? "border-t border-border-subtle" : ""}`}
                data-testid={`prompt-${r.key}`}
              >
                <Icon className="w-4 h-4 text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-text-primary">{r.label}</div>
                  {r.sub && <div className="text-[10px] font-mono-stat text-text-muted uppercase tracking-widest mt-0.5">{r.sub}</div>}
                </div>
                <div className={`relative w-10 h-5.5 rounded-full transition ${prefs[r.key] ? "bg-accent-pink" : "bg-bg-secondary border border-border-subtle"}`} style={{ height: "22px", width: "40px" }}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${prefs[r.key] ? "left-[21px]" : "left-0.5"}`} />
                </div>
              </button>
            );
          })}
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="mt-5 w-full py-3.5 rounded-xl bg-accent-pink text-white font-black uppercase tracking-widest text-sm active:scale-[0.98] disabled:opacity-60"
          data-testid="prompt-save"
        >
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
