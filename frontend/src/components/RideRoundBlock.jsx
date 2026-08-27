import React, { useEffect, useMemo, useState } from "react";
import { Coffee, Clock, Send, X, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents, useLiveRound } from "../lib/store";
import Avatar from "./Avatar";

function normalizeOrder(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function BaristaTally({ orders, headerless }) {
  // Group by normalized order text; preserve the first-seen "display" version.
  const groups = new Map();
  for (const o of orders) {
    const key = normalizeOrder(o.text);
    if (!key) continue;
    const g = groups.get(key) || { display: o.text.trim(), riders: [] };
    g.riders.push(o.name);
    groups.set(key, g);
  }
  const rows = Array.from(groups.values()).sort((a, b) => b.riders.length - a.riders.length);
  if (!rows.length) return null;
  // Auto-scale — big & bold on tiny lists, tighter as the peloton grows.
  const n = rows.length;
  const sz = n <= 3
    ? { ul: "space-y-3", gap: "gap-4", count: "text-4xl", name: "text-lg", riders: "text-[11px]" }
    : n <= 6
      ? { ul: "space-y-2", gap: "gap-3", count: "text-3xl", name: "text-base", riders: "text-[10px]" }
      : n <= 10
        ? { ul: "space-y-1.5", gap: "gap-2", count: "text-2xl", name: "text-sm", riders: "text-[10px]" }
        : { ul: "space-y-1", gap: "gap-2", count: "text-lg", name: "text-xs", riders: "text-[9px]" };
  return (
    <div className={headerless ? "" : "mt-3 border-t border-accent-coffee/25 pt-3"} data-testid="round-tally">
      {!headerless && (
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-coffee mb-1.5">
          Barista tally
        </div>
      )}
      <ul className={sz.ul}>
        {rows.map((g) => (
          <li key={g.display} className={`flex items-baseline ${sz.gap}`} data-testid={`tally-row-${g.display.slice(0,20)}`}>
            <span className={`font-heading font-black tabular-nums text-accent-pink shrink-0 leading-none ${sz.count}`}>
              {g.riders.length}×
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-white font-bold leading-tight ${sz.name}`}>{g.display}</div>
              <div className={`text-white font-mono-stat uppercase tracking-widest truncate ${sz.riders}`}>
                {g.riders.join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useCountdown(iso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return { text: "", seconds: 0, expired: true };
  const target = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((target - now) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return { text: `${mm}:${ss}`, seconds: secs, expired: secs <= 0 };
}

function OrderList({ round, compact = false }) {
  if (!round.orders?.length) {
    return (
      <div className="mt-2 text-[12px] text-text-muted italic" data-testid="round-orders-empty">
        No orders in yet…
      </div>
    );
  }
  return (
    <ul className="mt-2 space-y-1.5" data-testid="round-orders">
      {round.orders.map((o) => (
        <li
          key={o.user_id}
          className="flex items-center gap-2 bg-bg-primary/60 border border-border-subtle rounded-lg px-2.5 py-1.5"
          data-testid={`round-order-${o.user_id}`}
        >
          <Avatar name={o.name} photo={o.photo} size="xs" />
          <div className="flex-1 min-w-0">
            <div className={compact ? "text-[11px] text-white uppercase tracking-widest font-mono-stat" : "text-[10px] text-white uppercase tracking-widest font-mono-stat"}>
              {o.name}
            </div>
            <div className={compact ? "text-sm text-white" : "text-[13px] text-white leading-snug"}>
              {o.text}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function RideRoundBlock({ ride, initialCafe, otherActiveRound, onOpenOther }) {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const { open: openLiveRound, round: globalLiveRound } = useLiveRound();
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [showCloseView, setShowCloseView] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchRound = async () => {
      try {
        const { data } = await api.get(`/rides/${ride.id}/round`);
        if (!cancelled) setRound(data.round);
      } catch (_) { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchRound();
    // Re-fetch when the user comes back to the tab, so state stays fresh even
    // if a WS message got dropped or the client was backgrounded.
    const onVis = () => { if (document.visibilityState === "visible") fetchRound(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); };
  }, [ride.id]);

  useEffect(() => {
    return subscribe((evt) => {
      if (!evt.round || evt.round.ride_id !== ride.id) return;
      if (["coffee.round.started", "coffee.round.updated", "coffee.round.closed"].includes(evt.type)) {
        setRound(evt.round);
      }
    });
  }, [subscribe, ride.id]);

  // Reset the "Split the Bill" dismissal whenever the round cycles or the
  // ride changes so the CTA re-appears after any round closes / expires.
  useEffect(() => { /* round cycle no-op (kept for future hooks) */ }, [ride.id, round?.id, round?.closed]);

  const myOrder = useMemo(
    () => round?.orders?.find((o) => o.user_id === user?.id),
    [round, user],
  );
  const countdown = useCountdown(round?.close_at);
  const closed = !!round?.closed || countdown.expired;

  // Prefill text: existing order first, then user's saved usual (`coffee`).
  useEffect(() => {
    if (!round || closed) return;
    if (myOrder?.text) setOrderText(myOrder.text);
    else if (!orderText && user?.coffee) setOrderText(""); // wait for tap
  }, [round?.id, closed, myOrder?.text]);  // eslint-disable-line

  async function startRound() {
    setBusy(true);
    try {
      const cafeName = ride.cafe || initialCafe || "Café";
      const { data } = await api.post(`/rides/${ride.id}/round`, {
        cafe_name: cafeName,
        close_in_seconds: 300,
      });
      setRound(data);
      // Auto-slot the buyer's saved usual as the first order. Otherwise the
      // buyer — the one person who has to read the tally at the counter —
      // is forced to confirm their coffee twice (once by shouting, once by
      // ordering). If they don't have a usual yet the tally opens empty
      // and they can type it in.
      const usualText = (user?.coffee || "").trim();
      let latestRound = data;
      if (usualText) {
        try {
          const { data: withOrder } = await api.post(`/rides/${ride.id}/round/order`, { text: usualText });
          latestRound = withOrder;
          setRound(withOrder);
        } catch (_) { /* soft-fail: round is up, user can tap usual manually */ }
      }
      // Force-open the global barista tally splash so the buyer lands on
      // the tally instead of just seeing the inline block.
      try { openLiveRound(latestRound); } catch (_) { /* ignore */ }
      toast("Round on ☕", { description: `${cafeName} — 5 min to order.` });
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }

  async function submitOrder(textOverride) {
    const text = (textOverride ?? orderText).trim();
    if (!text) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/rides/${ride.id}/round/order`, { text });
      setRound(data);
      setOrderText(text);
      toast("In the round ✓");
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }

  async function retractOrder() {
    setBusy(true);
    try {
      const { data } = await api.delete(`/rides/${ride.id}/round/order`);
      setRound(data);
      setOrderText("");
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }

  async function closeRound() {
    setBusy(true);
    try {
      const { data } = await api.post(`/rides/${ride.id}/round/close`);
      setRound(data);
      setShowCloseView(true);
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className="mt-5 h-24 rounded-2xl border border-border-subtle animate-pulse bg-bg-secondary/40" />
    );
  }

  // No active round → single-action CTA
  if (!round || (closed && !showCloseView && !round?.closed_manually_at)) {
    const showStart = !round || countdown.expired;
    if (!showStart) return null;
    const cafeName = ride.cafe || initialCafe;
    // A live round already running on another ride (or passed in from the
    // Coffee tab) → funnel this rider into that round instead of starting
    // a competing one. Tapping "Add my coffee" opens the global tally.
    const alternate = otherActiveRound || (globalLiveRound && globalLiveRound.ride_id !== ride.id && !globalLiveRound.closed ? globalLiveRound : null);
    if (alternate) {
      return (
        <div className="mt-6 pt-4 border-t border-border-subtle" data-testid="ride-round-block">
          <div className="flex items-center gap-2 text-accent-pink mb-2">
            <Coffee className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-mono-stat font-bold">
              Round in progress · {alternate.buyer_name}
            </span>
          </div>
          <button
            onClick={() => (onOpenOther ? onOpenOther(alternate) : openLiveRound(alternate))}
            className="w-full bg-accent-pink text-white font-black uppercase tracking-[0.18em] text-sm py-4 rounded-xl active:scale-[0.98] shadow-pink flex items-center justify-center gap-2"
            data-testid="round-add-my-coffee"
          >
            <Coffee className="w-4 h-4" /> Add my coffee
          </button>
          <div className="mt-2 text-[10px] text-text-muted font-mono-stat uppercase tracking-widest text-center">
            Opens {alternate.buyer_name}&apos;s tally · orders close in the same window
          </div>
        </div>
      );
    }
    return (
      <div
        className="mt-6 pt-4 border-t border-border-subtle"
        data-testid="ride-round-block"
      >
        <div className="flex items-center gap-2 text-accent-pink mb-2">
          <Coffee className="w-3.5 h-3.5" />
          <span className="text-[10px] uppercase tracking-widest font-mono-stat font-bold">
            Coffee at {cafeName || "the café"}
          </span>
        </div>
        <button
          onClick={startRound}
          disabled={busy}
          className="w-full bg-accent-pink text-white font-black uppercase tracking-[0.18em] text-sm py-4 rounded-xl active:scale-[0.98] shadow-pink flex items-center justify-center gap-2 disabled:opacity-50"
          data-testid="round-start"
        >
          <Coffee className="w-4 h-4" /> I&apos;m Buying
        </button>
        <div className="mt-2 text-[10px] text-text-muted font-mono-stat uppercase tracking-widest text-center">
          Shout drops a 5-min push to the peloton · your usual auto-locks in
        </div>
      </div>
    );
  }

  // Active round
  const isBuyer = round.buyer_user_id === user?.id;
  const usual = user?.coffee;
  const pctLeft = Math.max(0, Math.min(100, (countdown.seconds / 300) * 100));

  return (
    <div
      className="mt-1 bg-gradient-to-br from-[#2C1E18] to-bg-primary border border-accent-coffee/40 rounded-2xl p-3"
      data-testid="ride-round-block"
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={round.buyer_name} photo={round.buyer_photo} size="sm" />
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] font-mono-stat uppercase tracking-widest text-accent-coffee${!closed ? " animate-pulse" : ""}`}>
            ● {isBuyer ? "You're shouting" : `${round.buyer_name}'s shout`}
          </div>
          <div className="font-heading text-sm font-bold text-text-primary leading-tight truncate" data-testid="round-cafe-name">
            {round.cafe_name}
          </div>
        </div>
        {!closed && (
          <div className="text-right shrink-0">
            <div className="text-[9px] font-mono-stat uppercase tracking-widest text-text-muted">Closes</div>
            <div className="text-accent-pink font-bold text-sm tabular-nums" data-testid="round-countdown">{countdown.text}</div>
          </div>
        )}
      </div>

      {!closed && (
        <div className="h-1 mt-2 rounded-full bg-border-subtle overflow-hidden">
          <div
            className="h-full bg-accent-pink transition-all"
            style={{ width: `${pctLeft}%` }}
          />
        </div>
      )}

      {/* Live barista tally — hero position, right under the shouter's card.
          Auto-scales so it stays visible without scrolling on any device. */}
      {!closed && round.orders.length > 0 && (
        <div className="mt-3 bg-black/40 border border-accent-coffee/40 rounded-xl p-3" data-testid="round-live-tally">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-coffee mb-2 font-bold">
            ☕ Barista tally · {round.orders.length} order{round.orders.length === 1 ? "" : "s"}
          </div>
          <BaristaTally orders={round.orders} headerless />
        </div>
      )}

      {closed ? (
        <div className="mt-4 bg-black/40 border border-accent-coffee/30 rounded-xl p-3" data-testid="round-locked">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-coffee mb-2 flex items-center gap-1">
            <Check className="w-3 h-3" /> Locked — {round.orders.length} order{round.orders.length === 1 ? "" : "s"}
          </div>
          <BaristaTally orders={round.orders} />
          <details className="mt-3 group">
            <summary className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-primary select-none">
              By rider · tap to expand
            </summary>
            <OrderList round={round} compact />
          </details>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                // Tally-first format so the barista sees "2× flat white" not names.
                const groups = new Map();
                for (const o of round.orders) {
                  const key = normalizeOrder(o.text);
                  if (!key) continue;
                  const g = groups.get(key) || { display: o.text.trim(), n: 0 };
                  g.n += 1;
                  groups.set(key, g);
                }
                const tally = Array.from(groups.values())
                  .sort((a, b) => b.n - a.n)
                  .map((g) => `${g.n}× ${g.display}`)
                  .join("\n");
                const detail = round.orders.map((o) => `- ${o.name}: ${o.text}`).join("\n");
                const text = `☕ ${round.cafe_name}\n${tally}\n\n(by rider:\n${detail})`;
                navigator.clipboard?.writeText(text);
                toast("Copied for the barista 📋");
              }}
              className="text-[10px] font-black uppercase tracking-widest bg-accent-coffee/20 border border-accent-coffee/40 text-accent-coffee py-2 rounded-lg active:scale-95"
              data-testid="round-copy"
            >
              Copy list
            </button>
            <button
              onClick={() => { setShowCloseView(false); setRound(null); }}
              className="text-[10px] font-black uppercase tracking-widest bg-bg-primary border border-border-subtle text-text-secondary py-2 rounded-lg active:scale-95"
              data-testid="round-dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {myOrder ? (
            <div className="bg-status-going/10 border border-status-going/30 rounded-xl p-3 flex items-center gap-2" data-testid="round-my-order">
              <Check className="w-4 h-4 text-status-going shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono-stat uppercase tracking-widest text-status-going">Your order</div>
                <div className="text-sm text-text-primary truncate">{myOrder.text}</div>
              </div>
              <button
                onClick={retractOrder}
                disabled={busy}
                className="p-1.5 text-text-muted hover:text-status-cant"
                data-testid="round-retract"
                aria-label="Retract order"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div>
              {usual && (
                <button
                  onClick={() => submitOrder(usual)}
                  disabled={busy}
                  className="w-full mb-3 px-4 py-4 rounded-xl bg-accent-pink text-white flex items-center gap-3 active:scale-[0.98] shadow-pink"
                  data-testid="round-usual"
                >
                  <Coffee className="w-5 h-5 shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[10px] font-mono-stat uppercase tracking-widest opacity-90">Tap to order my usual</div>
                    <div className="text-base font-bold truncate">{usual}</div>
                  </div>
                  <Send className="w-5 h-5 shrink-0" />
                </button>
              )}
              <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-1.5 text-center">
                Or type something different
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={orderText}
                  onChange={(e) => setOrderText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitOrder()}
                  placeholder="Flat white, no sugar…"
                  className="flex-1 bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-pink outline-none"
                  data-testid="round-order-input"
                  maxLength={140}
                />
                <button
                  onClick={() => submitOrder()}
                  disabled={busy || !orderText.trim()}
                  className="bg-accent-pink text-white rounded-xl px-3 py-2.5 disabled:opacity-40 active:scale-95"
                  data-testid="round-submit"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="mt-3">
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-1">
              {round.orders.length} order{round.orders.length === 1 ? "" : "s"} so far
            </div>
            <OrderList round={round} />
          </div>
          {/* Any rider can end the round early — if the buyer's already
              at the counter, stragglers shouldn't hold the tally open. */}
          <button
            onClick={closeRound}
            disabled={busy}
            className="mt-3 w-full text-[10px] font-black uppercase tracking-widest bg-bg-primary border border-status-cant/40 text-status-cant py-2 rounded-xl active:scale-95"
            data-testid="round-close-early"
          >
            {isBuyer ? "Close early" : "End round"}
          </button>
        </div>
      )}
    </div>
  );
}
