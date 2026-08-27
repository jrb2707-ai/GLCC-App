import React, { useEffect, useState } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents, useLiveRound } from "../../lib/store";
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

// Scale the barista tally card so every group fits on the splash without
// scrolling regardless of order count. Chunky when few, condensed when many.
function tallyScale(n) {
  if (n <= 3) return { ul: "space-y-5", gap: "gap-5", count: "text-6xl", name: "text-2xl", riders: "text-xs" };
  if (n <= 6) return { ul: "space-y-4", gap: "gap-4", count: "text-5xl", name: "text-xl", riders: "text-[11px]" };
  if (n <= 10) return { ul: "space-y-3", gap: "gap-3", count: "text-4xl", name: "text-lg", riders: "text-[10px]" };
  if (n <= 15) return { ul: "space-y-2", gap: "gap-2.5", count: "text-3xl", name: "text-base", riders: "text-[10px]" };
  return { ul: "space-y-1.5", gap: "gap-2", count: "text-2xl", name: "text-sm", riders: "text-[9px]" };
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
  const { open: openLiveRound, hasHidden, round: liveRound } = useLiveRound();
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
    // Don't run tab PTR while a round modal is open — otherwise the tab
    // scroll and the modal drag fight each other.
    if (detail) return;
    if (window.scrollY > 0) return;
    ptrStartRef.current = e.touches[0].clientY;
    ptrTriggeredRef.current = false;
  }
  function onTouchMove(e) {
    if (ptrStartRef.current == null) return;
    const dy = e.touches[0].clientY - ptrStartRef.current;
    // Larger dead-zone so a normal scroll gesture never surfaces the
    // indicator. Riders have to VERY deliberately pull past 60px before
    // anything visible happens.
    if (dy > 60) setPtrDelta(Math.min(220, dy - 60));
  }
  function onTouchEnd() {
    // Requires an intentional ~260px pull (60 dead-zone + 200 pull) to
    // actually fire refresh. Kills the "accidentally reloaded" complaint.
    if (ptrDelta > 200 && !ptrTriggeredRef.current) {
      ptrTriggeredRef.current = true;
      load();
      toast("Refreshing…");
    }
    setPtrDelta(0);
    ptrStartRef.current = null;
  }

  // Refresh on tab/page visibility change (returning to the app from a
  // lock screen, another browser tab, or when the installed Home Screen
  // PWA is resumed from background). `visibilitychange` alone misses the
  // iOS/Android PWA bfcache resume path, and `pageshow` fills the gap.
  // `focus` catches desktop tab returns where visibility already reports
  // "visible". A short in-flight guard keeps rapid triggers from stacking
  // duplicate requests. 30s interval remains as a safety net for missed
  // WS events.
  useEffect(() => {
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try { await load(); } finally { inFlight = false; }
    };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    const onPageShow = () => refresh();
    const onFocus = () => refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    const id = setInterval(refresh, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, []);  // eslint-disable-line

  // Live update when any round starts / gets an order / closes. The
  // global LiveRoundOverlay in HomeShell handles auto-opening the tally
  // splash — CoffeeTab just keeps its local list in sync here.
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
      style={{ transform: `translateY(${ptrDelta * 0.3}px)`, transition: ptrDelta ? "none" : "transform 200ms" }}
    >
      {ptrDelta > 80 && (
        <div className="absolute left-0 right-0 -top-2 flex justify-center pointer-events-none" data-testid="ptr-indicator">
          <div className={`text-[10px] font-mono-stat uppercase tracking-widest ${ptrDelta > 200 ? "text-accent-pink" : "text-text-muted"}`}>
            {ptrDelta > 200 ? "↓ Release to refresh" : "↓ Keep pulling…"}
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

      {/* Re-open chip: appears whenever there's a live round the user
          previously dismissed. One tap brings the tally splash back. */}
      {hasHidden && liveRound && (
        <button
          onClick={() => openLiveRound(liveRound)}
          className="w-full mb-3 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-accent-coffee/60 bg-accent-coffee/15 active:scale-[0.99]"
          data-testid="reopen-live-tally"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Coffee className="w-4 h-4 text-accent-coffee shrink-0" />
            <div className="min-w-0 text-left">
              <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-coffee font-bold">
                Live round · {liveRound.buyer_name}
              </div>
              <div className="text-xs text-text-primary truncate">
                {liveRound.orders.length} order{liveRound.orders.length === 1 ? "" : "s"} · {liveRound.cafe_name}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink font-black">Open tally →</span>
        </button>
      )}

      {/* PRIMARY position: the ride-round card (with its inline barista
          tally) is the hero the second a round is live. This lets the
          buyer see the tally without scrolling past a duplicate row. */}
      {nextRide ? (
        <div data-testid="coffee-quick-shout">
          <RideRoundBlock
            ride={nextRide}
            initialCafe={nextRide.cafe}
            otherActiveRound={active.find((r) => r.ride_id !== nextRide.id) || null}
            onOpenOther={openLiveRound}
          />
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
          <button
            disabled
            className="w-full bg-bg-secondary border border-border-subtle text-text-muted font-black uppercase tracking-[0.18em] text-sm py-4 rounded-xl opacity-60 flex items-center justify-center gap-2 cursor-not-allowed"
            data-testid="round-start-disabled"
          >
            <Coffee className="w-4 h-4" /> I&apos;m Buying
          </button>
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

      {/* Other live rounds (that aren't on the pinned nextRide the
          RideRoundBlock already renders). Only visible when there's more
          than one round in flight across the club. */}
      {(() => {
        const others = active.filter((r) => r.ride_id !== nextRide?.id);
        if (loading || others.length === 0) return null;
        return (
          <div className="mt-6" data-testid="active-rounds-others">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[11px] font-mono-stat uppercase tracking-widest text-accent-pink font-bold animate-pulse">Also live</span>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>
            <div className="space-y-2">
              {others.map((r) => <RoundRow key={r.id} round={r} onOpen={openRound} />)}
            </div>
          </div>
        );
      })()}

      {/* Lower "Live now" section — only rendered as an empty/loading state
          when no round is currently active. */}
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

export function RoundDetailModal({ round, onClose, onChange, usual }) {
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
    // Only allow drag when the touch STARTS in the top ~30% of the screen.
    // Prevents accidental dismiss when scrolling the tally / order list.
    const y = e.touches[0].clientY;
    if (y > window.innerHeight * 0.3) return;
    dragStartRef.current = y;
    setDragY(0);
  }
  function onTouchMove(e) {
    if (dragStartRef.current == null) return;
    const dy = e.touches[0].clientY - dragStartRef.current;
    if (dy > 0) setDragY(dy);
  }
  function onTouchEnd() {
    if (dragY > 100) { onClose(); }
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
      className="fixed inset-0 z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      data-testid="coffee-round-modal"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.88) 55%, rgba(0,0,0,0.96) 100%), url(https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=70)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        transform: `translateY(${dragY}px)`,
        transition: dragY ? "none" : "transform 200ms",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* Whole header block is grabbable — pull anywhere from the drag
          handle down through the shout row to dismiss. Frees riders from
          hunting for the 12px pill. */}
      <div className="flex flex-col h-full max-w-md mx-auto px-5">
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="pt-2 pb-1 flex justify-center cursor-grab select-none"
          data-testid="modal-drag-handle"
        >
          <div className="w-16 h-1.5 bg-white/60 rounded-full" />
        </div>
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="flex items-center justify-between pb-2 cursor-grab select-none"
        >
          <div className="min-w-0">
            <div className={`text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink${round.closed ? "" : " animate-pulse"}`}>
              {round.closed ? "● Locked" : "● Live"} · {round.orders.length} order{round.orders.length === 1 ? "" : "s"} · {round.cafe_name}
            </div>
            <div className="font-heading text-lg font-black text-white truncate drop-shadow">
              {round.buyer_name}&apos;s shout
            </div>
          </div>
          <button onClick={onClose} className="text-white/85 hover:text-white text-xl p-2 -mr-2" aria-label="Close">✕</button>
        </div>

        {/* Barista tally — takes the whole splash. If there are no orders
            we fall through to a friendly empty state. */}
        {round.orders.length > 0 ? (
          <div className="overflow-y-auto py-2" data-testid="modal-tally">
            <div className="border border-accent-coffee/60 rounded-3xl p-5 bg-black/55 backdrop-blur-sm">
              <div className="text-xs font-mono-stat uppercase tracking-[0.25em] text-accent-coffee mb-4 font-black">
                ☕ Barista tally
              </div>
              <ul className={tallyScale(tallyOrders(round.orders).length).ul}>
                {tallyOrders(round.orders).map((g) => {
                  const sz = tallyScale(tallyOrders(round.orders).length);
                  return (
                    <li key={g.display} className={`flex items-baseline ${sz.gap}`}>
                      <span className={`font-heading font-black tabular-nums text-accent-pink shrink-0 leading-none ${sz.count}`}>{g.riders.length}×</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-white font-black leading-tight ${sz.name}`}>{g.display}</div>
                        <div className={`text-white font-mono-stat uppercase tracking-widest truncate mt-1 ${sz.riders}`}>{g.riders.join(" · ")}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {round.closed && (
              <button
                onClick={copyList}
                className="mt-3 w-full text-sm font-black uppercase tracking-widest bg-accent-coffee text-black py-4 rounded-2xl active:scale-95 shadow-2xl"
                data-testid="modal-copy"
              >
                Copy list for barista
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-white/80">
              <div className="text-6xl mb-3">☕</div>
              <div className="text-lg font-bold">No orders in yet</div>
              <div className="text-sm text-white/60 mt-1">Riders can tap their usual in a second.</div>
            </div>
          </div>
        )}

        {/* Order controls — pinned to the bottom of the splash. Only render
            when the round is live and the user hasn't ordered. */}
        {!round.closed && (
          <div className="pb-6 pt-3 border-t border-white/10">
            {myOrder ? (
              <div className="bg-status-going/15 border border-status-going/40 rounded-xl p-3 flex items-center gap-2" data-testid="modal-my-order">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono-stat uppercase tracking-widest text-status-going">Your order</div>
                  <div className="text-sm text-white truncate">{myOrder.text}</div>
                </div>
                <button onClick={retract} disabled={busy} className="text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-status-cant px-2" data-testid="modal-retract">
                  Undo
                </button>
              </div>
            ) : (
              <>
                {usual && (
                  <button
                    onClick={() => submitOrder(usual)}
                    disabled={busy}
                    className="w-full mb-2 px-4 py-3.5 rounded-xl bg-accent-pink text-white flex items-center gap-3 active:scale-[0.98] shadow-pink"
                    data-testid="modal-usual"
                  >
                    <Coffee className="w-5 h-5 shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[10px] font-mono-stat uppercase tracking-widest opacity-90">Tap to order my usual</div>
                      <div className="text-sm font-bold truncate">{usual}</div>
                    </div>
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={orderText}
                    onChange={(e) => setOrderText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitOrder()}
                    placeholder="Or type something different…"
                    className="flex-1 bg-black/50 border border-white/25 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-accent-pink outline-none"
                    data-testid="modal-order-input"
                    maxLength={140}
                  />
                  <button
                    onClick={() => submitOrder()}
                    disabled={busy || !orderText.trim()}
                    className="bg-accent-pink text-white rounded-xl px-4 py-2.5 disabled:opacity-40 active:scale-95 text-[11px] font-black uppercase tracking-widest"
                    data-testid="modal-submit"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
