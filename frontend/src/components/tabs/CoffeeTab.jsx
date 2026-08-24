import React, { useEffect, useState } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { toast } from "sonner";
import Avatar from "../Avatar";
import { Coffee, ChevronRight } from "lucide-react";
import RideRoundBlock from "../RideRoundBlock";

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
            <span className="text-[9px] font-mono-stat uppercase tracking-widest bg-accent-pink/15 text-accent-pink px-1.5 py-0.5 rounded-full">Live</span>
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
      // Pick the closest upcoming ride so the top-of-tab CTA has a target.
      const now = Date.now();
      const upcoming = (r.data.rides || [])
        .filter((rd) => rd.starts_at && new Date(rd.starts_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      setNextRide(upcoming[0] || (r.data.rides || [])[0] || null);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setUsual(user?.coffee || "Medium Flat White"); }, [user?.coffee]);

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
      toast("Usual saved ☕", { description: "Tap 'Usual' next time a round drops." });
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setSavingUsual(false); }
  }

  function openRound(round) {
    // Always show the modal with the live orders + inline order input so the
    // rider can slot in their order without switching tabs.
    setDetail(round);
  }

  return (
    <div className="px-4 pt-4 pb-8" data-testid="coffee-tab">
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-heading text-3xl font-black uppercase text-text-primary">Coffee</h2>
        <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
          {active.length} live · {history.length} past
        </span>
      </div>

      {/* Quick-shout CTA: same block used on ride detail, bound to the next
          upcoming ride so any rider can start a round without navigating. */}
      {nextRide && (
        <div data-testid="coffee-quick-shout">
          <RideRoundBlock ride={nextRide} initialCafe={nextRide.cafe} />
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

      {/* Active rounds */}
      <div className="mt-6" data-testid="active-rounds-section">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink font-bold">Live now</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
        {loading ? (
          <div className="h-16 rounded-2xl border border-border-subtle animate-pulse bg-bg-secondary/40" />
        ) : active.length === 0 ? (
          <div className="text-[12px] text-text-muted italic px-1" data-testid="active-empty">
            No active rounds. Open a ride and shout the peloton a coffee ☕
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((r) => <RoundRow key={r.id} round={r} onOpen={openRound} />)}
          </div>
        )}
      </div>

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
    const text = round.orders.map((o) => `${o.name}: ${o.text}`).join("\n");
    navigator.clipboard?.writeText(text);
    toast("Copied for the barista 📋");
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="coffee-round-modal"
    >
      <div className="w-full max-w-sm bg-bg-primary border border-border-subtle rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Avatar name={round.buyer_name} photo={round.buyer_photo} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink">
              {round.closed ? "Locked" : "Live"}
            </div>
            <div className="font-heading text-lg font-bold text-text-primary truncate">
              {round.buyer_name}&apos;s shout
            </div>
            <div className="text-[12px] text-text-secondary truncate">
              {round.cafe_name} · {round.ride_name}
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted p-1" aria-label="Close">✕</button>
        </div>

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
                    className="w-full mb-2 text-left px-3 py-2 rounded-xl border border-accent-pink/40 bg-accent-pink/10 text-text-primary flex items-center gap-2 active:scale-[0.98]"
                    data-testid="modal-usual"
                  >
                    <span className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink shrink-0">Usual →</span>
                    <span className="text-sm truncate flex-1">{usual}</span>
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={orderText}
                    onChange={(e) => setOrderText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitOrder()}
                    placeholder="Flat white, no sugar…"
                    className="flex-1 bg-bg-secondary border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-pink outline-none"
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

        <div className="mt-4">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-1.5">
            {round.orders.length} order{round.orders.length === 1 ? "" : "s"}{round.closed ? " · locked" : ""}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-auto" data-testid="modal-order-list">
            {round.orders.map((o) => (
              <div key={o.user_id} className="bg-bg-secondary border border-border-subtle rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                <Avatar name={o.name} photo={o.photo} size="xs" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">{o.name}</div>
                  <div className="text-sm text-text-primary">{o.text}</div>
                </div>
              </div>
            ))}
            {round.orders.length === 0 && (
              <div className="text-[12px] text-text-muted italic">No orders in yet.</div>
            )}
          </div>
        </div>

        {round.closed && round.orders.length > 0 && (
          <button
            onClick={copyList}
            className="mt-3 w-full text-[10px] font-black uppercase tracking-widest bg-accent-coffee/20 border border-accent-coffee/40 text-accent-coffee py-2 rounded-lg active:scale-95"
            data-testid="modal-copy"
          >
            Copy list for barista
          </button>
        )}
      </div>
    </div>
  );
}
