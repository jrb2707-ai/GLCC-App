import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { COFFEES, IMG, timeAgo } from "../../lib/util";
import Avatar from "../Avatar";
import { Coffee, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function CoffeeTab() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [rounds, setRounds] = useState([]);
  const [modal, setModal] = useState(false);
  const [coffee, setCoffee] = useState(user.coffee || "Medium Flat White");
  const isPending = user.status === "pending";

  // Only show orders placed today (local time). Backend TTL is 1h so this is
  // usually the same set anyway, but the filter is explicit and future-proof.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayRounds = rounds.filter((r) => {
    if (!r.created_at) return false;
    return new Date(r.created_at) >= startOfToday;
  });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/coffee/rounds");
      setRounds(data.rounds);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((evt) => {
      if (evt.type === "coffee.round") {
        setRounds((prev) => {
          if (prev.some((p) => p.id === evt.round.id)) return prev;
          return [evt.round, ...prev].slice(0, 30);
        });
      }
    });
  }, [subscribe]);

  async function send(coffeeOverride) {
    const c = coffeeOverride || user.coffee || coffee;
    try {
      const { data } = await api.post("/coffee/rounds", { coffee: c });
      setModal(false);
      toast(`Round sent — ${data.coffee}`, { description: "The peloton hears you" });
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  async function quickSend() {
    await send(user.coffee);
  }

  return (
    <div className="relative pb-8" data-testid="coffee-tab">
      {/* Hero */}
      <div className="relative h-72 overflow-hidden">
        <img src={IMG.espresso} alt="espresso" className="w-full h-full object-cover" style={{ objectPosition: "center 45%" }} />
        {/* Stronger scrim at the top so the copy stays legible over the light cup */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/85 via-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg-primary to-transparent" />
        <div className="absolute inset-0 grain" />
        <div className="absolute top-5 left-5 right-5">
          <div className="flex items-center gap-2 text-accent-coffee">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em]" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>You&apos;re at the café?</span>
          </div>
          <h2 className="font-heading text-4xl font-black uppercase mt-1 leading-none text-white" style={{ textShadow: "0 2px 14px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6)" }}>Coffee Order</h2>
        </div>
      </div>

      <div className="px-5 -mt-4 relative z-10">
        <button
        onClick={quickSend}
        disabled={isPending}
        className="w-full bg-accent-pink text-white font-bold uppercase tracking-widest py-3 rounded-2xl shadow-pink active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        data-testid="coffee-send-round-button"
      >
        <Coffee className="w-4 h-4" /> Order My Coffee
      </button>
      <div className="mt-1.5 text-center text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
        {isPending ? "Awaiting admin approval" : `Sends ${user.coffee} · change from your profile`}
      </div>
      </div>

      <div className="px-5 mt-6">
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">Today&apos;s coffee orders</div>
        <div className="space-y-2" data-testid="coffee-feed">
          {todayRounds.length === 0 && (
            <div className="text-text-muted text-xs py-8 text-center">Silent morning. Someone stand up.</div>
          )}
          {todayRounds.map((r) => (
            <div
              key={r.id}
              className="bg-bg-secondary border border-border-subtle rounded-xl p-3 flex items-center gap-3"
              data-testid={`coffee-round-${r.id}`}
            >
              <Avatar name={r.rider_name} photo={null} size="sm" tint="pink" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{r.rider_name}</div>
                <div className="text-[11px] text-text-secondary truncate">{r.coffee}</div>
              </div>
              <div className="text-[10px] font-mono-stat uppercase text-text-muted">{timeAgo(r.created_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="absolute inset-0 z-30 bg-black/70 flex items-center justify-center px-6 animate-slide-down" data-testid="coffee-modal">
          <div className="w-full bg-bg-secondary border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-pink">Send a coffee round</div>
            <h3 className="font-heading text-2xl font-black uppercase mt-1">Your coffee</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-64 overflow-y-auto no-scrollbar">
              {COFFEES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCoffee(c)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs ${
                    coffee === c
                      ? "bg-accent-pink/15 border-accent-pink text-accent-pink"
                      : "bg-bg-primary border-border-subtle text-text-secondary"
                  }`}
                  data-testid={`coffee-option-${c.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setModal(false)}
                className="flex-1 py-3 rounded-xl border border-border-subtle text-text-secondary text-xs uppercase tracking-widest"
                data-testid="coffee-modal-cancel"
              >
                Cancel
              </button>
              <button
                onClick={() => send(coffee)}
                className="flex-1 py-3 rounded-xl bg-accent-pink text-white font-bold uppercase tracking-widest text-xs shadow-pink"
                data-testid="coffee-modal-send"
              >
                Send to group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
