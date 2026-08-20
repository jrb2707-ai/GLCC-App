import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import Avatar from "../Avatar";
import { ArrowLeft, MapPin, Coffee, ChevronRight, Mountain, Route, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import StravaPanel from "../StravaPanel";

const RSVP_OPTIONS = [
  { key: "going", label: "Going", color: "bg-status-going/20 text-status-going border-status-going/40" },
  { key: "maybe", label: "Maybe", color: "bg-status-maybe/20 text-status-maybe border-status-maybe/40" },
  { key: "no", label: "Can't go", color: "bg-status-cant/20 text-status-cant border-status-cant/40" },
];

function RouteMap({ name, mapUrl }) {
  if (mapUrl) {
    return (
      <div className="rounded-2xl overflow-hidden relative border border-border-subtle h-48 bg-black" data-testid="route-map">
        <img src={mapUrl} alt={`Route map — ${name}`} className="w-full h-full object-cover" />
        <div className="absolute bottom-2 left-3 text-[10px] font-mono-stat uppercase tracking-widest text-white bg-black/40 px-2 py-0.5 rounded">
          route · {name}
        </div>
      </div>
    );
  }
  // Fallback stylized SVG when there's no Strava map
  const seed = name?.length || 8;
  const points = Array.from({ length: 8 }, (_, i) => {
    const x = 20 + i * 42;
    const y = 60 + Math.sin((i + seed) * 0.9) * 26 + (i % 2 === 0 ? -6 : 6);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="route-hatch rounded-2xl overflow-hidden relative border border-border-subtle h-40" data-testid="route-map">
      <svg viewBox="0 0 340 140" className="w-full h-full">
        <defs>
          <linearGradient id="rg" x1="0" x2="1">
            <stop offset="0" stopColor="#D4FF00" />
            <stop offset="1" stopColor="#FF5722" />
          </linearGradient>
        </defs>
        <polyline points={points} fill="none" stroke="url(#rg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy={points.split(" ")[0].split(",")[1]} r="5" fill="#D4FF00" />
        <circle cx="314" cy={points.split(" ")[7].split(",")[1]} r="5" fill="#FF5722" />
      </svg>
      <div className="absolute bottom-2 left-3 text-[10px] font-mono-stat uppercase tracking-widest text-text-secondary">
        route · {name}
      </div>
    </div>
  );
}

function goingList(ride, riders) {
  const ids = Object.entries(ride.rsvps || {})
    .filter(([, v]) => v === "going")
    .map(([id]) => id);
  return ids.map((id) => riders.find((r) => r.id === id)).filter(Boolean);
}

export default function RidesTab({ onNavigate }) {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [rides, setRides] = useState([]);
  const [riders, setRiders] = useState([]);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [rr, us] = await Promise.all([api.get("/rides"), api.get("/riders")]);
      setRides(rr.data.rides);
      setRiders(us.data.riders);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((evt) => {
      if (evt.type === "ride.updated" || evt.type === "ride.created") {
        setRides((prev) => {
          const idx = prev.findIndex((r) => r.id === evt.ride.id);
          if (idx === -1) return [...prev, evt.ride];
          const next = [...prev];
          next[idx] = evt.ride;
          return next;
        });
      }
      if (evt.type === "rider.updated" && evt.rider?.id) {
        setRiders((prev) => {
          const idx = prev.findIndex((r) => r.id === evt.rider.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = evt.rider;
          return next;
        });
      }
    });
  }, [subscribe]);

  async function setRsvp(rideId, status) {
    try {
      const { data } = await api.post(`/rides/${rideId}/rsvp`, { status });
      setRides((prev) => prev.map((r) => (r.id === rideId ? data : r)));
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  async function sendRound(ride) {
    try {
      const { data } = await api.post("/coffee/rounds", { ride_id: ride.id });
      toast(`Round sent — ${data.coffee}`, { description: `for ${ride.cafe || "the group"}` });
      if (onNavigate) onNavigate("coffee");
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  const open = rides.find((r) => r.id === openId);

  if (open) {
    const myRsvp = open.rsvps?.[user.id];
    const going = goingList(open, riders);
    return (
      <div className="px-5 pt-4 pb-8" data-testid="ride-detail">
        <button
          onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1.5 mb-4 px-3 py-2 rounded-full bg-bg-secondary border border-border-subtle text-text-primary hover:border-accent-strava/50 active:scale-95 transition"
          data-testid="ride-back"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs uppercase tracking-widest font-bold">Back to Rides</span>
        </button>
        <div className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent">
          {open.day} · {open.date} · {open.time}
        </div>
        <h2 className="font-heading text-3xl font-black uppercase leading-tight mt-1">{open.name}</h2>
        <p className="text-text-secondary text-sm mt-1">{open.route}</p>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-mono-stat">Distance</div>
            <div className="font-heading text-xl font-bold mt-1">{open.distance}</div>
          </div>
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-mono-stat">Elevation</div>
            <div className="font-heading text-xl font-bold mt-1">{open.elevation}</div>
          </div>
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-mono-stat">Pace</div>
            <div className="font-heading text-xl font-bold mt-1">{open.pace}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary">
          <MapPin className="w-3.5 h-3.5 text-brand-accent" />
          <span>{open.location ? `Depart ${open.location}` : "Location TBC"}</span>
        </div>

        {open.source === "strava" && open.strava_url && (
          <a
            href={open.strava_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-[#FC4C02] hover:underline"
            data-testid="ride-strava-link"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open in Strava
          </a>
        )}

        <div className="mt-4">
          <RouteMap name={open.name} mapUrl={open.map_url} />
        </div>

        <div className="mt-5">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">Your RSVP</div>
          <div className="flex gap-2">
            {RSVP_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setRsvp(open.id, o.key)}
                className={`flex-1 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest ${
                  myRsvp === o.key ? o.color : "bg-bg-secondary text-text-secondary border-border-subtle"
                }`}
                data-testid={`rsvp-${o.key}-button`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {open.cafe && (
          <div className="mt-5 bg-gradient-to-br from-[#2C1E18] to-bg-primary border border-accent-coffee/30 rounded-2xl p-4" data-testid="cafe-block">
            <div className="flex items-center gap-2 text-accent-coffee">
              <Coffee className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-widest font-mono-stat">Café stop</span>
            </div>
            <div className="font-heading text-xl font-bold mt-1">{open.cafe}</div>
            <button
              onClick={() => sendRound(open)}
              className="mt-3 w-full bg-accent-pink text-white font-bold uppercase tracking-widest text-xs py-2.5 rounded-lg active:scale-[0.98] shadow-pink flex items-center justify-center gap-2"
              data-testid="cafe-send-round-button"
            >
              <Coffee className="w-4 h-4" /> I&apos;m At The Café
            </button>
          </div>
        )}

        <div className="mt-5">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">
            Going · {going.length}
          </div>
          <div className="flex flex-wrap gap-2">
            {going.length === 0 && <div className="text-text-muted text-xs">Nobody yet — be the first.</div>}
            {going.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 bg-bg-secondary border border-border-subtle rounded-full pl-1 pr-3 py-1"
              >
                <Avatar name={r.name} photo={r.photo} size="xs" />
                <span className="text-xs text-text-primary">{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6" data-testid="rides-list">
      <StravaPanel onSynced={load} />
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-heading text-3xl font-black uppercase">Rides Calendar</h2>
        <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
          {rides.length} scheduled
        </span>
      </div>

      <div className="space-y-3">
        {rides.map((r) => {
          const going = Object.values(r.rsvps || {}).filter((v) => v === "going").length;
          return (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="w-full text-left bg-bg-secondary border border-border-subtle hover:border-accent-volt/40 rounded-2xl p-4 transition"
              data-testid={`ride-card-${r.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent flex items-center gap-2 flex-wrap">
                    <span>{[r.day, r.date, r.time].filter(Boolean).join(" · ") || "TBC"}</span>
                    {r.source === "strava" && (
                      <span className="text-[9px] uppercase tracking-widest font-bold bg-[#FC4C02]/20 text-[#FC4C02] border border-[#FC4C02]/40 px-1.5 rounded normal-case">
                        Strava
                      </span>
                    )}
                  </div>
                  <div className="font-heading text-xl font-bold uppercase mt-1 leading-tight">{r.name}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-muted flex-none" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1 text-xs text-text-secondary">
                  <Route className="w-3.5 h-3.5 text-brand-accent flex-none" /> {r.distance || "—"}
                </div>
                <div className="flex items-center gap-1 text-xs text-text-secondary">
                  <Mountain className="w-3.5 h-3.5 text-accent-orange flex-none" /> {r.elevation || "—"}
                </div>
              </div>
              {r.cafe && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-accent-coffee">
                  <Coffee className="w-4 h-4 flex-none" />
                  <span className="truncate">{r.cafe}</span>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-widest font-mono-stat text-text-muted">
                  {going} going
                </div>
                <div className="text-[10px] text-text-secondary flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 flex-none" /> <span className="truncate">{(r.location || "").split(",")[0] || "Location TBC"}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
