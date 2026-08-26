import React, { useEffect, useState } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { toast } from "sonner";
import Avatar from "../Avatar";
import { Coffee, ChevronRight } from "lucide-react";
import RideRoundBlock from "../RideRoundBlock";

function normalizeOrder(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tallyOrders(orders) {
  const groups = new Map();
  for (const o of orders) {
    const key = normalizeOrder(o.text);
    if (!key) continue;
    const g = groups.get(key) || { display: o.text.trim(), riders: [] };
    g.riders.push(o.name);
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => b.riders.length - a.riders.length);
}

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function RoundRow({ round, onOpen }) {
  return (
    <button
      onClick={() => onOpen?.(round)}
      className="w-full flex items-center gap-3 bg-bg-secondary border border-border-subtle rounded-2xl p-3 text-left active:scale-[0.99]"
      data-testid={`coffee-round-row-${round.id}`}
    >
      <Avatar name={round.buyer_name} photo={round.buyer_photo} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-heading text-base font-bold text-text-primary truncate">
            {round.buyer_name}&apos;s shout
          </span>
          {!round.closed && (
            <span className="animate-pulse text-[9px] font-mono-stat uppercase tracking-widest bg-accent-pink/15 text-accent-pink px-1.5 py-0.5 rounded-full">Live</span>
          )}
        </div>
        <div className="text-[12px] text-text-secondary truncate">
          {round.cafe_name} · {round.ride_name || "Ride"}
        </div>
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mt-0.5">
          {round.orders.length} order{round.orders.length === 1 ? "" : "s"} · {timeAgo(round.started_at)}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
    </button>
  );
}

export default function CoffeeTab({ onNavigate }) {
  const { user, refreshMe } = useAuth();
  const { subscribe } = useEvents();
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [nextRide, setNextRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usual, setUsual] = useState(user?.coffee || "Medium Flat White");
  const [savingUsual, setSavingUsual] = useState(false);
  const [detail, setDetail] = useState(null); // round object to preview

  const load = async () => {
    try {
      const [a, h, r] = await Promise.all([
        api.get("/coffee/rounds/active"),
        api.get("/coffee/rounds/history"),
        api.get("/rides"),
      ]);
      setActive(a.data.rounds || []);
      setHistory(h.data.rounds || []);
      // Only attach the CTA to an actually-upcoming ride so a stale/past ride
      // can't hide the buttons. If nothing upcoming → nextRide stays null and
      // the tab shows a greyed "sync Strava" prompt.
      const now = Date.now();
      const upcoming = (r.data.rides || [])
        .filter((rd) => rd.starts_at && new Date(rd.starts_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      setNextRide(upcoming[0] || null);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setUsual(user?.coffee || "Medium Flat White"); }, [user?.coffee]);

  // Pull-to-refresh on mobile web. Triggers a manual load() when the user
  // drags down more than ~80px from the top of the tab content. Works around
  // the fact that the SPA scrolls inside a div, so the browser's native PTR
  // never fires.
  const [ptrDelta, setPtrDelta] = useState(0);
  const ptrStartRef = React.useRef(null);
  const ptrTriggeredRef = React.useRef(false);
  function onTouchStart(e) {
    // Only allow pull if the scroll container (window) is at the very top.
    if (window.scrollY > 0) return;
    ptrStartRef.current = e.touches[0].clientY;
    ptrTriggeredRef.current = false;
  }
  function onTouchMove(e) {
    if (ptrStartRef.current == null) return;
    const dy = e.touches[0].clientY - ptrStartRef.current;
    if (dy > 0) setPtrDelta(Math.min(120, dy));
  }
  function onTouchEnd() {
    if (ptrDelta > 70 && !ptrTriggeredRef.current) {
      ptrTriggeredRef.current = true;
      load();
      toast("Refreshing…");
    }
    setPtrDelta(0);
    ptrStartRef.current = null;
  }

  // Refresh on tab/page visibility change (returning to the app from a lock
  // screen or a different browser tab). Also poll every 30s while visible so
  // state can't drift silently if a WS event was missed.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, []);  // eslint-disable-line

  // Live update when any round starts / gets an order / closes.
  useEffect(() => {
    return subscribe((evt) => {
      if (!evt.round) return;
      if (evt.type === "coffee.round.started") {
        setActive((prev) => [evt.round, ...prev.filter((r) => r.id !== evt.round.id)]);
      }
      if (evt.type === "coffee.round.updated") {
        setActive((prev) => prev.map((r) => (r.id === evt.round.id ? evt.round : r)));
      }
      if (evt.type === "coffee.round.closed") {
        setActive((prev) => prev.filter((r) => r.id !== evt.round.id));
        setHistory((prev) => [evt.round, ...prev.filter((r) => r.id !== evt.round.id)].slice(0, 20));
      }
    });
  }, [subscribe]);

  async function saveUsual() {
    if (savingUsual) return;
    const trimmed = usual.trim();
    if (!trimmed) { toast.error("Give me your usual first."); return; }
    setSavingUsual(true);
    try {
      await api.patch("/riders/me", { coffee: trimmed });
      await refreshMe?.();
      // If a live round is already flashing, jump straight into it instead of
      // sending a "saved" toast — one-tap into the peloton's shout.
      if (active.length > 0) {
        setDetail(active[0]);
      } else {
        toast("Usual saved ☕", { description: "Tap 'Usual' next time a round drops." });
      }
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setSavingUsual(false); }
  }

  function openRound(round) {
    // Always show the modal with the live orders + inline order input so the
    // rider can slot in their order without switching tabs.
    setDetail(round);
  }

  return (
    <div
      className={active.length > 0 ? "px-4 pt-1 pb-8" : "px-4 pt-4 pb-8"}
      data-testid="coffee-tab"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: `translateY(${ptrDelta * 0.4}px)`, transition: ptrDelta ? "none" : "transform 200ms" }}
    >
      {ptrDelta > 20 && (
        <div className="absolute left-0 right-0 -top-2 flex justify-center pointer-events-none" data-testid="ptr-indicator">
          <div className={`text-[10px] font-mono-stat uppercase tracking-widest ${ptrDelta > 70 ? "text-accent-pink" : "text-text-muted"}`}>
            {ptrDelta > 70 ? "↓ Release to refresh" : "↓ Pull to refresh"}
          </div>
        </div>
      )}
      {/* Hide the tall COFFEE title when a round is live so the shout card
          is above the fold on tiny viewports (mobile Safari eats ~150px
          for the chrome). Falls back to the full header otherwise. */}
      {active.length > 0 && !loading ? null : (
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="font-heading text-3xl font-black uppercase text-text-primary">Coffee</h2>
          <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
            {active.length} live · {history.length} past
          </span>
        </div>
      )}

      {/* When a round is live, hoist it to the very top so nobody has to
          scroll past the quick-shout CTA or the "Your Usual" card to see
          "who's shouting right now". */}
      {active.length > 0 && !loading && (
        <div className="mb-4" data-testid="active-rounds-top">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="font-heading text-base font-black uppercase tracking-widest text-accent-pink animate-pulse" data-testid="live-now-header">
              ● Live now
            </span>
            <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
              {active.length} live · {history.length} past
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <div className="space-y-2">
            {active.map((r) => <RoundRow key={r.id} round={r} onOpen={openRound} />)}
          </div>
        </div>
      )}

      {/* Quick-shout CTA: same block used on ride detail, bound to the next
          upcoming ride so any rider can start a round without navigating.
          When there's no upcoming ride we show a greyed prompt to sync Strava
          rather than silently hiding the primary action. */}
      {nextRide ? (
        <div data-testid="coffee-quick-shout">
          <RideRoundBlock ride={nextRide} initialCafe={nextRide.cafe} />
        </div>
      ) : !loading && (
        <div
          className="mt-2 pt-4 border-t border-border-subtle"
          data-testid="coffee-no-upcoming"
        >
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <Coffee className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-mono-stat font-bold">
              Coffee shout
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled
              className="bg-bg-secondary border border-border-subtle text-text-muted font-black uppercase tracking-[0.18em] text-xs py-3.5 rounded-xl opacity-60 flex items-center justify-center gap-2 cursor-not-allowed"
              data-testid="round-start-disabled"
            >
              <Coffee className="w-3.5 h-3.5" /> I&apos;m Buying
            </button>
            <button
              disabled
              className="bg-bg-secondary border border-border-subtle text-text-muted font-black uppercase tracking-[0.18em] text-xs py-3.5 rounded-xl opacity-60 cursor-not-allowed"
              data-testid="round-not-my-turn-disabled"
            >
              Split the Bill
            </button>
          </div>
          <div className="mt-2 text-[10px] text-text-muted font-mono-stat uppercase tracking-widest text-center">
            No upcoming rides — sync Strava
          </div>
        </div>
      )}

      {/* Usual order */}
      <div className="bg-bg-secondary border border-border-subtle rounded-2xl p-4" data-testid="usual-card">
        <div className="flex items-center gap-2 text-accent-pink">
          <Coffee className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-widest font-mono-stat font-bold">Your usual</span>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={usual}
            onChange={(e) => setUsual(e.target.value)}
            placeholder="Flat white, no sugar…"
            className="flex-1 bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-pink outline-none"
            data-testid="usual-input"
            maxLength={140}
          />
          <button
            onClick={saveUsual}
            disabled={savingUsual || !usual.trim()}
            className="bg-accent-pink text-white rounded-xl px-3 py-2.5 disabled:opacity-40 active:scale-95 shadow-pink"
            data-testid="usual-save"
            aria-label="Save usual order"
          >
            <Coffee className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-[10px] text-text-muted font-mono-stat uppercase tracking-widest">
          Pre-fills when someone starts a round. One tap and you&apos;re in.
        </div>
      </div>

      {/* Lower "Live now" section — only rendered as an empty/loading state
          when no round is currently active (avoids duplicating the block we
          hoisted to the top of the tab). */}
      {(loading || active.length === 0) && (
        <div className="mt-6" data-testid="active-rounds-section">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[11px] font-mono-stat uppercase tracking-widest text-text-muted font-bold">Live now</span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          {loading ? (
            <div className="space-y-2" data-testid="active-skeleton">
              <div className="h-16 rounded-2xl border border-border-subtle animate-pulse bg-bg-secondary/40" />
              <div className="h-16 rounded-2xl border border-border-subtle animate-pulse bg-bg-secondary/40" />
            </div>
          ) : (
            <div className="text-[12px] text-text-muted italic px-1" data-testid="active-empty">
              No live rounds right now.
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="mt-6" data-testid="history-section">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted font-bold">Past rounds</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
        {history.length === 0 ? (
          <div className="text-[12px] text-text-muted italic px-1" data-testid="history-empty">
            Nothing here yet — history keeps the last 7 days.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((r) => <RoundRow key={r.id} round={r} onOpen={openRound} />)}
          </div>
        )}
      </div>

      {/* Round preview modal — full orders list + inline order input so the
          rider can slot into any live round without leaving the Coffee tab. */}
      {detail && (
        <RoundDetailModal
          round={detail}
          onClose={() => setDetail(null)}
          onChange={(next) => setDetail(next)}
          usual={user?.coffee}
        />
      )}
    </div>
  );
}

function RoundDetailModal({ round, onClose, onChange, usual }) {
  const { subscribe } = useEvents();
  const [orderText, setOrderText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = React.useRef(null);
  // Live-update whenever anyone submits or the round closes.
  useEffect(() => subscribe((evt) => {
    if (!evt.round || evt.round.id !== round.id) return;
    if (["coffee.round.updated", "coffee.round.closed"].includes(evt.type)) {
      onChange(evt.round);
    }
  }), [subscribe, round.id, onChange]);
  const { user } = useAuth();
  const myOrder = round.orders?.find((o) => o.user_id === user?.id);
  useEffect(() => { if (myOrder?.text) setOrderText(myOrder.text); }, [myOrder?.text]);

  function onTouchStart(e) {
    dragStartRef.current = e.touches[0].clientY;
    setDragY(0);
  }
  function onTouchMove(e) {
    if (dragStartRef.current == null) return;
    const dy = e.touches[0].clientY - dragStartRef.current;
    if (dy > 0) setDragY(dy);
  }
  function onTouchEnd() {
    if (dragY > 120) { onClose(); }
    setDragY(0);
    dragStartRef.current = null;
  }

  async function submitOrder(textOverride) {
    const text = (textOverride ?? orderText).trim();
    if (!text) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/rides/${round.ride_id}/round/order`, { text });
      onChange(data);
      setOrderText(text);
      toast("In the round ✓");
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }
  async function retract() {
    setBusy(true);
    try {
      const { data } = await api.delete(`/rides/${round.ride_id}/round/order`);
      onChange(data);
      setOrderText("");
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }
  function copyList() {
    const tally = tallyOrders(round.orders)
      .map((g) => `${g.riders.length}× ${g.display}`)
      .join("\n");
    const detail = round.orders.map((o) => `- ${o.name}: ${o.text}`).join("\n");
    const text = `☕ ${round.cafe_name}\n${tally}\n\n(by rider:\n${detail})`;
    navigator.clipboard?.writeText(text);
    toast("Copied for the barista 📋");
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="coffee-round-modal"
    >
      <div
        className="w-full sm:max-w-md relative overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-2xl transition-transform"
        style={{
          height: "92vh",
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.95) 100%), url(https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=60)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          transform: `translateY(${dragY}px)`,
        }}
      >
        {/* Swipe-down handle */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="pt-2 pb-1 flex justify-center cursor-grab select-none"
          data-testid="modal-drag-handle"
        >
          <div className="w-12 h-1.5 bg-white/40 rounded-full" />
        </div>
        <div className="px-5 pb-6 h-[calc(92vh-1.5rem)] overflow-y-auto">
        <div className="flex items-center gap-3">
          <Avatar name={round.buyer_name} photo={round.buyer_photo} size="md" />
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-mono-stat uppercase tracking-widest text-accent-pink${round.closed ? "" : " animate-pulse"}`}>
              {round.closed ? "● Locked" : "● Live"} · {round.orders.length} order{round.orders.length === 1 ? "" : "s"}
            </div>
            <div className="font-heading text-xl font-black text-white truncate drop-shadow">
              {round.buyer_name}&apos;s shout
            </div>
            <div className="text-sm text-white/90 truncate drop-shadow">
              {round.cafe_name} · {round.ride_name}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-2" aria-label="Close">✕</button>
        </div>

        {/* Barista tally — HERO position, right after the header, so it's
            always visible without scrolling. Order controls + by-rider
            details drop below it. */}
        {round.orders.length > 0 && (
          <div className="mt-4 border border-accent-coffee/60 rounded-2xl p-4 bg-black/60 backdrop-blur-sm" data-testid="modal-tally">
            <div className="text-[11px] font-mono-stat uppercase tracking-widest text-accent-coffee mb-3 font-bold">
              ☕ Barista tally
            </div>
            <ul className="space-y-3">
              {tallyOrders(round.orders).map((g) => (
                <li key={g.display} className="flex items-baseline gap-3">
                  <span className="font-heading text-3xl font-black tabular-nums text-accent-pink shrink-0 leading-none">{g.riders.length}×</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg text-white font-bold leading-tight">{g.display}</div>
                    <div className="text-xs text-white/95 font-mono-stat uppercase tracking-widest truncate mt-0.5">{g.riders.join(" · ")}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {round.closed && round.orders.length > 0 && (
          <button
            onClick={copyList}
            className="mt-3 w-full text-xs font-black uppercase tracking-widest bg-accent-coffee/30 border border-accent-coffee/70 text-white py-3 rounded-xl active:scale-95"
            data-testid="modal-copy"
          >
            Copy list for barista
          </button>
        )}

        {!round.closed && (
          <div className="mt-4">
            {myOrder ? (
              <div className="bg-status-going/10 border border-status-going/30 rounded-xl p-3 flex items-center gap-2" data-testid="modal-my-order">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono-stat uppercase tracking-widest text-status-going">Your order</div>
                  <div className="text-sm text-text-primary truncate">{myOrder.text}</div>
                </div>
                <button onClick={retract} disabled={busy} className="text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-status-cant px-2" data-testid="modal-retract">
                  Undo
                </button>
              </div>
            ) : (
              <div>
                {usual && (
                  <button
                    onClick={() => submitOrder(usual)}
                    disabled={busy}
                    className="w-full mb-3 px-4 py-4 rounded-xl bg-accent-pink text-white flex items-center gap-3 active:scale-[0.98] shadow-pink"
                    data-testid="modal-usual"
                  >
                    <Coffee className="w-5 h-5 shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[10px] font-mono-stat uppercase tracking-widest opacity-90">Tap to order my usual</div>
                      <div className="text-base font-bold truncate">{usual}</div>
                    </div>
                  </button>
                )}
                <div className="text-[10px] font-mono-stat uppercase tracking-widest text-white/80 mb-1.5 text-center">
                  Or type something different
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={orderText}
                    onChange={(e) => setOrderText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitOrder()}
                    placeholder="Flat white, no sugar…"
                    className="flex-1 bg-black/50 border border-white/25 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-accent-pink outline-none"
                    data-testid="modal-order-input"
                    maxLength={140}
                  />
                  <button
                    onClick={() => submitOrder()}
                    disabled={busy || !orderText.trim()}
                    className="bg-accent-pink text-white rounded-xl px-3 py-2.5 disabled:opacity-40 active:scale-95 text-[11px] font-black uppercase tracking-widest"
                    data-testid="modal-submit"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <details className="group mt-5">
          <summary className="text-[11px] font-mono-stat uppercase tracking-widest text-white/80 cursor-pointer hover:text-white select-none mb-2 font-bold">
            By rider · tap to expand
          </summary>
          <div className="space-y-2 max-h-80 overflow-auto" data-testid="modal-order-list">
            {round.orders.map((o) => (
              <div key={o.user_id} className="bg-white/95 border border-white/20 rounded-xl px-3 py-2.5 flex items-center gap-3">
                <Avatar name={o.name} photo={o.photo} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono-stat uppercase tracking-widest text-black font-bold">{o.name}</div>
                  <div className="text-base text-black font-medium leading-tight">{o.text}</div>
                </div>
              </div>
            ))}
            {round.orders.length === 0 && (
              <div className="text-[13px] text-white/70 italic">No orders in yet.</div>
            )}
          </div>
        </details>
        </div>
      </div>
    </div>
  );
}
