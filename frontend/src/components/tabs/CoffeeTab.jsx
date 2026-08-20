import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { COFFEES, IMG, timeAgo } from "../../lib/util";
import Avatar from "../Avatar";
import { Coffee, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function CoffeeTab() {
  const { user, refreshMe } = useAuth();
  const { subscribe } = useEvents();
  const [rounds, setRounds] = useState([]);
  const [modal, setModal] = useState(false);
  const [coffee, setCoffee] = useState(user.coffee || "Medium Flat White");

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
        setRounds((prev) => [evt.round, ...prev].slice(0, 30));
      }
    });
  }, [subscribe]);

  async function send() {
    try {
      const { data } = await api.post("/coffee/rounds", { coffee });
      if (coffee !== user.coffee) {
        // update profile default silently
        await api.patch("/riders/me", { coffee });
        await refreshMe();
      }
      setModal(false);
      toast(`Round sent — ${data.coffee}`, { description: "The peloton hears you" });
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  return (
    <div className="relative pb-8" data-testid="coffee-tab">
      {/* Hero */}
      <div className="relative h-64 overflow-hidden">
        <img src={IMG.espresso} alt="espresso" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-bg-primary" />
        <div className="absolute inset-0 grain" />
        <div className="absolute top-5 left-5 right-5">
          <div className="flex items-center gap-2 text-accent-coffee">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em]">You&apos;re at the café?</span>
          </div>
          <h2 className="font-heading text-4xl font-black uppercase mt-1 leading-none">Coffee Order</h2>
        </div>
      </div>

      <div className="px-5 -mt-4 relative z-10">
        <button
          onClick={() => setModal(true)}
          className="w-full bg-accent-pink text-white font-bold uppercase tracking-widest py-3 rounded-2xl shadow-pink active:scale-[0.98] flex items-center justify-center gap-2"
          data-testid="coffee-send-round-button"
        >
          <Coffee className="w-4 h-4" /> I&apos;m at the café
        </button>
      </div>

      <div className="px-5 mt-6">
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">Recent rounds</div>
        <div className="space-y-2" data-testid="coffee-feed">
          {rounds.length === 0 && (
            <div className="text-text-muted text-xs py-8 text-center">Silent morning. Someone stand up.</div>
          )}
          {rounds.map((r) => (
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
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end animate-slide-down" data-testid="coffee-modal">
          <div className="w-full bg-bg-secondary border-t border-border-subtle rounded-t-3xl p-5 pb-8">
            <div className="w-10 h-1 rounded-full bg-border-subtle mx-auto mb-4" />
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-coffee">Send a coffee round</div>
            <h3 className="font-heading text-2xl font-black uppercase mt-1">Your coffee</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-64 overflow-y-auto no-scrollbar">
              {COFFEES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCoffee(c)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs ${
                    coffee === c
                      ? "bg-accent-volt/15 border-accent-volt text-accent-volt"
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
                onClick={send}
                className="flex-1 py-3 rounded-xl bg-accent-volt text-black font-bold uppercase tracking-widest text-xs"
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
