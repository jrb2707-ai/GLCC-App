import React, { useEffect, useMemo, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

// Full-screen Barista Tally for the buyer to hand-hold at the counter.
// - Huge tally rows, auto-scaled to fit any peloton size.
// - Big pink countdown that reads off the server's `close_at` and drift-
//   corrects against the server clock (`serverNow` prop) so a rider with
//   a wrong system clock still sees the truth.
// - "Copy for barista" pumps the tally-first list into the clipboard.
// - Dismisses on X, backdrop tap, or Escape.

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[.,!;\s]+$/g, "").replace(/\s+/g, " ").trim();
}

function useDriftCorrectedCountdown(closeIso, serverNowIso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    if (!closeIso) return { text: "—", seconds: 0, closed: true };
    const close = new Date(closeIso).getTime();
    const drift = serverNowIso ? new Date(serverNowIso).getTime() - Date.now() : 0;
    const seconds = Math.max(0, Math.floor((close - (now + drift)) / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return {
      text: `${m}:${String(s).padStart(2, "0")}`,
      seconds,
      closed: seconds <= 0,
    };
  }, [closeIso, serverNowIso, now]);
}

export default function BaristaTallyFullscreen({ round, serverNow: serverNowProp, onClose }) {
  const [serverNow, setServerNow] = useState(serverNowProp || null);
  const countdown = useDriftCorrectedCountdown(round?.close_at, serverNow);
  const [copied, setCopied] = useState(false);

  // Drift-correct once on open — one hit is enough because the countdown
  // then runs against the fixed server offset.
  useEffect(() => {
    if (serverNow || !round?.ride_id) return;
    let cancelled = false;
    api.get(`/rides/${round.ride_id}/round`).then(({ data }) => {
      if (!cancelled && data.server_now) setServerNow(data.server_now);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [round?.ride_id, serverNow]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    const groups = new Map();
    for (const o of round?.orders || []) {
      const key = normalize(o.text);
      if (!key) continue;
      const g = groups.get(key) || { display: (o.text || "").trim(), riders: [] };
      g.riders.push(o.name);
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort((a, b) => b.riders.length - a.riders.length);
  }, [round]);

  const n = rows.length;
  const sz = n <= 3
    ? { count: "text-7xl", name: "text-3xl", riders: "text-sm", gap: "gap-6", ul: "space-y-6" }
    : n <= 6
      ? { count: "text-6xl", name: "text-2xl", riders: "text-xs", gap: "gap-5", ul: "space-y-4" }
      : n <= 10
        ? { count: "text-5xl", name: "text-xl", riders: "text-xs", gap: "gap-4", ul: "space-y-3" }
        : { count: "text-3xl", name: "text-base", riders: "text-[10px]", gap: "gap-3", ul: "space-y-2" };

  if (!round) return null;

  async function copyForBarista() {
    const list = rows.map((g) => `${g.riders.length}× ${g.display}`).join("\n");
    const header = `${round.buyer_name || "Round"} · ${round.cafe_name || ""}`.trim();
    try {
      await navigator.clipboard.writeText(`${header}\n${list}`);
      setCopied(true);
      toast.success("Copied for barista");
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      toast.error("Couldn't copy — long-press to select");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-black text-white flex flex-col"
      data-testid="barista-tally-fullscreen"
    >
      {/* Ambient coffee gradient — sits behind everything, subtle. */}
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_top,#5b2a15_0%,#000000_60%)]" />

      <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono-stat uppercase tracking-[0.3em] text-accent-coffee">
            {countdown.closed ? "Round locked" : `${round.buyer_name || "Round"}'s shout`}
          </div>
          <div className="font-heading text-2xl font-black uppercase tracking-wide truncate">
            {round.cafe_name || "Café"}
          </div>
          {round.cafe_address && (
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-white/50 truncate">
              {round.cafe_address}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-3 w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center active:scale-95"
          data-testid="barista-tally-close"
          aria-label="Close full-screen tally"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Big countdown pill — pink so it reads across a café counter. */}
      <div className="relative px-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full ${countdown.closed ? "bg-white/30" : "bg-accent-pink"} transition-all`}
              style={{ width: `${Math.min(100, (countdown.seconds / 300) * 100)}%` }}
            />
          </div>
          <div
            className={`font-heading font-black tabular-nums ${countdown.closed ? "text-white/60" : "text-accent-pink"} text-3xl leading-none`}
            data-testid="barista-tally-countdown"
          >
            {countdown.closed ? "LOCKED" : countdown.text}
          </div>
        </div>
      </div>

      {/* The tally itself — hero of the screen. */}
      <div className="relative flex-1 min-h-0 overflow-y-auto px-5 py-3">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/50">
            <div className="text-[10px] font-mono-stat uppercase tracking-[0.3em]">Waiting on first order</div>
            <div className="mt-2 text-base">The tally will appear here as riders drop orders.</div>
          </div>
        ) : (
          <ul className={sz.ul} data-testid="barista-tally-list">
            {rows.map((g) => (
              <li key={g.display} className={`flex items-baseline ${sz.gap}`} data-testid={`barista-tally-row-${g.display.slice(0, 20)}`}>
                <span className={`font-heading font-black tabular-nums text-accent-pink shrink-0 leading-none ${sz.count}`}>
                  {g.riders.length}×
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`font-bold leading-tight ${sz.name}`}>{g.display}</div>
                  <div className={`text-white/60 font-mono-stat uppercase tracking-widest truncate ${sz.riders}`}>
                    {g.riders.join(" · ")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative px-5 pb-6 pt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={copyForBarista}
          disabled={rows.length === 0}
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl bg-accent-pink text-white font-heading font-black uppercase tracking-widest text-sm active:scale-[0.98] disabled:opacity-40"
          data-testid="barista-tally-copy"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy for barista"}
        </button>
      </div>
    </div>
  );
}
