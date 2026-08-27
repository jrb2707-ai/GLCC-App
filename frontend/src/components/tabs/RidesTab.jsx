import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import Avatar from "../Avatar";
import { ArrowLeft, MapPin, Coffee, Mountain, Route } from "lucide-react";
import { toast } from "sonner";
import StravaPanel from "../StravaPanel";
import RideRoundBlock from "../RideRoundBlock";
import { inferRidePaceClass, PACE_CHIP_LABEL, PACE_CHIP_CLS } from "../../lib/ride";

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

// Overlapping avatar chip stack — up to 4 riders, then "+N" pill. Colours
// cycle so identical rows don't look like the same person twice.
const STACK_COLORS = ["#3a5a8c", "#8c6a3a", "#2b8f6b", "#6a3a8c", "#8c3a5a"];
function AvatarStack({ riders, total }) {
  const shown = riders.slice(0, 3);
  const extra = Math.max(0, total - shown.length);
  return (
    <div className="flex items-center gap-2" data-testid="going-stack">
      <div className="flex -space-x-2">
        {shown.map((r, i) => (
          <div
            key={r.id}
            className="w-6 h-6 rounded-full border-2 border-bg-secondary flex items-center justify-center text-[10px] font-black text-white overflow-hidden"
            style={{ background: STACK_COLORS[i % STACK_COLORS.length] }}
            title={r.name}
          >
            {r.photo ? (
              <img src={r.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              (r.name || "?").slice(0, 1).toUpperCase()
            )}
          </div>
        ))}
        {extra > 0 && (
          <div className="w-6 h-6 rounded-full border-2 border-bg-secondary bg-bg-primary flex items-center justify-center text-[9px] font-black text-text-secondary">
            +{extra}
          </div>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-widest font-mono-stat text-text-muted">
        {total} going
      </span>
    </div>
  );
}

export default function RidesTab({ onNavigate }) {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [rides, setRides] = useState([]);
  const [riders, setRiders] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [routeExpanded, setRouteExpanded] = useState(false);
  useEffect(() => { setRouteExpanded(false); }, [openId]);
  const isPending = user.status === "pending";

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

  const open = rides.find((r) => r.id === openId);

  // Swipe-right anywhere on the ride-detail view returns to the rides list.
  // Uses touch events so it doesn't conflict with vertical scroll or with
  // HomeShell's tab-swipe (which no-ops when already on the first tab).
  const detailSwipe = React.useRef({ x: 0, y: 0, active: false });
  const onDetailTouchStart = (e) => {
    const t = e.touches[0];
    detailSwipe.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onDetailTouchEnd = (e) => {
    if (!detailSwipe.current.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - detailSwipe.current.x;
    const dy = t.clientY - detailSwipe.current.y;
    detailSwipe.current.active = false;
    if (dx > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      setOpenId(null);
    }
  };

  if (open) {
    const myRsvp = open.rsvps?.[user.id];
    const going = goingList(open, riders);
    return (
      <div
        className="px-5 pt-4 pb-8"
        data-testid="ride-detail"
        onTouchStart={onDetailTouchStart}
        onTouchEnd={onDetailTouchEnd}
      >
        <button
          onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1.5 mb-4 px-3 py-2 rounded-full bg-bg-secondary border border-border-subtle text-text-primary hover:border-accent-strava/50 active:scale-95 transition"
          data-testid="ride-back"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs uppercase tracking-widest font-bold">Back to Rides</span>
          <span className="text-[10px] text-text-muted font-mono-stat tracking-widest ml-1">· swipe →</span>
        </button>
        <div className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent">
          {open.day} · {open.date} · {open.time}
        </div>
        <h2 className="font-heading text-3xl font-black uppercase leading-tight mt-1">{open.name}</h2>
        <div className="mt-2">
          {(() => {
            const paceCls = inferRidePaceClass(open);
            return (
              <span
                className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${PACE_CHIP_CLS[paceCls]}`}
                data-testid="ride-detail-pace"
              >
                {PACE_CHIP_LABEL[paceCls]}
              </span>
            );
          })()}
        </div>
        {open.route && (
          <button
            type="button"
            onClick={() => setRouteExpanded((v) => !v)}
            disabled={!open.route_description}
            className={`text-left mt-1 ${open.route_description ? "cursor-pointer" : "cursor-default"}`}
            data-testid="ride-route-line"
          >
            <div className="flex items-center gap-1 text-text-secondary text-sm">
              <span>{open.route}</span>
              {open.route_description && (
                <span className="text-[10px] font-mono-stat tracking-widest text-accent-volt">
                  {routeExpanded ? "▲" : "▼"}
                </span>
              )}
            </div>
            {routeExpanded && open.route_description && (
              <div
                className="mt-2 p-3 rounded-xl bg-bg-secondary border border-border-subtle text-[13px] text-text-primary whitespace-pre-wrap leading-relaxed"
                data-testid="ride-route-description"
              >
                {open.route_description}
              </div>
            )}
          </button>
        )}

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

        <div className="mt-4">
          <RouteMap name={open.name} mapUrl={open.map_url} />
        </div>

        <div className="mt-5">
          <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">
            Your RSVP {isPending && <span className="ml-1 text-status-maybe">· locked until approval</span>}
          </div>
          <div className="flex gap-2">
            {RSVP_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setRsvp(open.id, o.key)}
                disabled={isPending}
                className={`flex-1 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed ${
                  myRsvp === o.key ? o.color : "bg-bg-secondary text-text-secondary border-border-subtle"
                }`}
                data-testid={`rsvp-${o.key}-button`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

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

        <RideRoundBlock ride={open} initialCafe={open.cafe} />
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
          const goingIds = Object.entries(r.rsvps || {})
            .filter(([, v]) => v === "going")
            .map(([id]) => id);
          const goingRiders = goingIds
            .map((id) => riders.find((rd) => rd.id === id))
            .filter(Boolean);
          const going = goingIds.length;
          const paceCls = inferRidePaceClass(r);
          return (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="w-full text-left bg-bg-secondary border border-border-subtle hover:border-accent-volt/40 rounded-2xl p-4 transition"
              data-testid={`ride-card-${r.id}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent">
                  {[r.day, r.date, r.time].filter(Boolean).join(" · ") || "TBC"}
                </span>
                {r.source === "strava" && (
                  <span
                    className="text-[9px] uppercase tracking-widest font-bold bg-[#FC4C02]/20 text-[#FC4C02] border border-[#FC4C02]/40 px-1.5 rounded normal-case"
                    data-testid={`ride-strava-${r.id}`}
                  >
                    Strava
                  </span>
                )}
              </div>
              <div className="font-heading text-xl font-bold uppercase mt-1 leading-tight">
                {r.name}
              </div>
              <div className="mt-2">
                <span
                  className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${PACE_CHIP_CLS[paceCls]}`}
                  data-testid={`ride-pace-${r.id}`}
                >
                  {PACE_CHIP_LABEL[paceCls]}
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-4 text-[13px] text-text-secondary font-mono-stat">
                <span className="flex items-center gap-1">
                  <Route className="w-3.5 h-3.5 text-brand-accent flex-none" />
                  {r.distance || "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Mountain className="w-3.5 h-3.5 text-accent-orange flex-none" />
                  {r.elevation || "—"}
                </span>
              </div>
              {r.cafe && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-accent-coffee">
                  <Coffee className="w-4 h-4 flex-none" />
                  <span className="truncate">{r.cafe}</span>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <AvatarStack riders={goingRiders} total={going} />
                <div className="text-[10px] text-text-secondary flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 flex-none" />
                  <span className="truncate">
                    {(r.location || "").split(",")[0] || "Location TBC"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
