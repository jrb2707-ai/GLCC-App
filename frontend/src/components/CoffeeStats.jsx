import React, { useEffect, useState } from "react";
import { Coffee, ChevronDown, ChevronUp, Trophy, Award } from "lucide-react";
import { api } from "../lib/api";

// GLCC Coffee System — Phase 2 UI cards (per Build Spec).
// Rendered together at the top of the Coffee tab. Each hits its own endpoint
// so they can fail/refresh independently without dragging the other cards
// down.

// Colours per spec: red (25 rounds), pink (50), yellow (100). Fallback grey
// for "no jersey yet" — always show progress even at zero.
const JERSEY = {
  red:    { bg: "#EF4444", label: "Ruby Roaster",  glow: "rgba(239,68,68,0.35)" },
  pink:   { bg: "#EC4899", label: "Pink Peloton",  glow: "rgba(236,72,153,0.35)" },
  yellow: { bg: "#FBBF24", label: "Yellow Jersey", glow: "rgba(251,191,36,0.35)" },
};

// Inline jersey chip — used in rider rows too if we choose to render it.
export function JerseyBadge({ tier, size = "sm" }) {
  const j = JERSEY[tier];
  if (!j) return null;
  const px = size === "lg" ? "h-6 px-2 text-[11px]" : "h-4 px-1.5 text-[9px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-black uppercase tracking-widest text-white ${px}`}
      style={{ backgroundColor: j.bg, boxShadow: `0 0 0 2px ${j.glow}` }}
      data-testid={`jersey-${tier}`}
      title={j.label}
    >
      <Award className={size === "lg" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      {j.label}
    </span>
  );
}

export function StatsCard() {
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.get("/coffee/stats/me").then(({ data }) => setStats(data)).catch(() => {});
  }, []);
  if (!stats) return null;
  const j = stats.current_tier ? JERSEY[stats.current_tier] : null;
  const remaining = stats.next_threshold ? stats.next_threshold - stats.bought : 0;
  return (
    <div
      className="bg-bg-secondary border border-border-subtle rounded-2xl p-4"
      data-testid="stats-card"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-none"
          style={{
            backgroundColor: j ? j.bg : "var(--glcc-bg-primary)",
            boxShadow: j ? `0 0 0 3px ${j.glow}` : "inset 0 0 0 1px var(--glcc-border-subtle)",
          }}
        >
          <Award className={`w-5 h-5 ${j ? "text-white" : "text-text-muted"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">Your stats</div>
          <div className="font-heading text-lg font-black uppercase leading-tight text-text-primary truncate">
            {j ? j.label : "No jersey yet"}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
      </button>
      {/* Progress bar — always visible, even collapsed. Spec section 7. */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-mono-stat uppercase tracking-widest">
          <span className="text-text-muted">{stats.bought} bought</span>
          <span className="text-text-secondary">
            {stats.next_threshold
              ? `${remaining} to ${stats.next_tier}`
              : "All jerseys earned"}
          </span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-bg-primary overflow-hidden border border-border-subtle">
          <div
            className="h-full transition-all"
            style={{
              width: `${stats.progress_pct}%`,
              backgroundColor: stats.next_tier ? JERSEY[stats.next_tier].bg : JERSEY.yellow.bg,
            }}
          />
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-border-subtle text-[12px] text-text-secondary space-y-1">
          <div><b className="text-text-primary">{stats.bought}</b> rounds bought · <b className="text-text-primary">{stats.joined}</b> joined</div>
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted pt-1">Jersey tiers</div>
          <div className="flex flex-wrap gap-1.5">
            <JerseyBadge tier="red" />
            <JerseyBadge tier="pink" />
            <JerseyBadge tier="yellow" />
          </div>
          <div className="text-[10px] text-text-muted">25 · 50 · 100 rounds bought.</div>
        </div>
      )}
    </div>
  );
}

export function TopBuyersCard() {
  const [rows, setRows] = useState([]);
  const [period, setPeriod] = useState("year");
  useEffect(() => {
    api.get(`/coffee/leaderboard?period=${period}`).then(({ data }) => setRows(data.rows || [])).catch(() => {});
  }, [period]);
  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-2xl p-4 mt-3" data-testid="leaderboard-card">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-brand-accent" />
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted flex-1">Top buyers</div>
        <div className="flex gap-1 bg-bg-primary rounded-full p-0.5 text-[10px] font-mono-stat">
          {["month", "year"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 rounded-full uppercase tracking-widest font-bold ${period === p ? "bg-accent-pink text-white" : "text-text-secondary"}`}
              data-testid={`leaderboard-period-${p}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 text-[12px] text-text-muted italic">No shouts yet this {period}.</div>
      ) : (
        <ol className="mt-2 space-y-1">
          {rows.slice(0, 5).map((r, i) => {
            const medal = ["#FFD700", "#C0C0C0", "#CD7F32"][i];
            return (
              <li key={r.rider_id} className="flex items-center gap-2 text-sm" data-testid={`leaderboard-row-${i}`}>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center font-heading font-black text-[11px] flex-none"
                  style={{ backgroundColor: medal || "var(--glcc-bg-primary)", color: medal ? "#000" : "var(--glcc-text-muted)" }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-text-primary">{r.name}</span>
                <span className="font-heading text-sm font-black tabular-nums text-brand-accent">{r.rounds}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function YourHistoryCard() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get("/coffee/history/me").then(({ data }) => setRows(data.rows || [])).catch(() => {});
  }, []);
  if (rows.length === 0) return null;
  return (
    <div className="mt-6" data-testid="history-card">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted font-bold">Your last 5</span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="bg-bg-secondary border border-border-subtle rounded-xl px-3 py-2 flex items-center gap-3"
            data-testid={`history-row-${r.id}`}
          >
            <Coffee className={`w-4 h-4 flex-none ${r.was_buyer ? "text-accent-pink" : "text-text-muted"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text-primary truncate">
                {r.was_buyer ? <span className="font-semibold">Your shout</span> : <span>{r.buyer_name}'s shout</span>}
                {r.my_drink && <span className="text-text-muted"> · {r.my_drink}</span>}
              </div>
              <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
                {r.cafe || "—"} · {fmtDate(r.started_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
