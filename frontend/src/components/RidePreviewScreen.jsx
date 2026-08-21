import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

// Standalone auth-free ride preview so /r/:id from the reminder email lands
// on a proper page even without the native app installed. Uses only the
// web app's Tailwind vocabulary so it looks native to the existing shell.
export default function RidePreviewScreen({ rideId, onSignIn }) {
  const [ride, setRide] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/rides/public/${rideId}`);
        if (!cancelled) setRide(data);
      } catch (e) {
        if (!cancelled) setErr(e?.response?.status === 404 ? "Ride not found" : "Couldn't load ride");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rideId]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg-primary" data-testid="ride-preview-loading">
        <div className="w-8 h-8 rounded-full border-2 border-accent-volt/30 border-t-accent-volt animate-spin" />
      </div>
    );
  }
  if (err || !ride) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-bg-primary px-8 text-center" data-testid="ride-preview-error">
        <div className="font-heading text-4xl uppercase font-black text-text-primary">Missed it</div>
        <p className="mt-3 text-text-secondary text-sm max-w-[260px]">{err || "This ride link no longer resolves."}</p>
        <button
          onClick={onSignIn}
          className="mt-8 px-6 py-3 rounded-lg bg-accent-volt text-black font-black uppercase tracking-[0.2em] text-xs"
          data-testid="ride-preview-signin"
        >
          Go to app
        </button>
      </div>
    );
  }

  const timeLabel = [ride.day, ride.date, ride.time].filter(Boolean).join(" · ") || "TBC";

  return (
    <div className="h-full w-full overflow-y-auto bg-bg-primary" data-testid="ride-preview">
      {/* Hero */}
      <div className="relative">
        {ride.map_url ? (
          <div className="h-56 w-full overflow-hidden">
            <img src={ride.map_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-bg-primary" />
          </div>
        ) : (
          <div className="h-40 w-full bg-gradient-to-br from-accent-volt/20 via-bg-primary to-strava-orange/20" />
        )}
        <div className="absolute top-4 left-5 flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-pink" />
          <span className="font-heading text-lg font-black tracking-wider text-white">GLCC.</span>
        </div>
      </div>

      <div className="px-5 pt-6 pb-8">
        <div className="text-[10px] tracking-[0.3em] font-bold uppercase text-accent-volt">{timeLabel}</div>
        <h1 className="mt-2 font-heading font-black text-4xl uppercase leading-none tracking-tight text-text-primary" data-testid="ride-preview-name">
          {ride.name}
        </h1>
        {ride.route && <div className="mt-3 text-sm text-text-secondary">{ride.route}</div>}

        <div className="grid grid-cols-3 gap-2 mt-5">
          <Stat label="Distance" value={ride.distance || "—"} />
          <Stat label="Elevation" value={ride.elevation || "—"} />
          <Stat label="Pace" value={ride.pace || "—"} />
        </div>

        {ride.location && (
          <div className="mt-5 text-sm text-text-secondary">📍 Depart {ride.location}</div>
        )}

        {ride.cafe && (
          <div className="mt-5 p-4 rounded-xl border border-accent-coffee/30 bg-[#2c1e18]/70">
            <div className="text-[10px] tracking-[0.3em] font-bold uppercase text-accent-coffee">☕ Café stop</div>
            <div className="mt-1 font-heading font-black text-xl text-text-primary">{ride.cafe}</div>
          </div>
        )}

        <div className="mt-6">
          <div className="text-[10px] tracking-[0.3em] font-bold uppercase text-text-muted">
            Going · {ride.going_count}
          </div>
          {ride.going_first_names?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ride.going_first_names.map((n, i) => (
                <div key={`${n}-${i}`} className="px-3 py-1 rounded-full bg-bg-secondary border border-border-subtle text-xs text-text-primary">
                  {n}
                </div>
              ))}
            </div>
          )}
          {ride.going_count === 0 && (
            <div className="mt-2 text-xs text-text-muted">Nobody yet — be the first.</div>
          )}
        </div>

        <button
          onClick={onSignIn}
          className="mt-8 w-full py-3 rounded-xl border border-border-subtle text-text-secondary font-bold uppercase tracking-[0.2em] text-xs"
          data-testid="ride-preview-close"
        >
          Back to GLCC
        </button>

        <div className="mt-8 text-center text-[10px] tracking-[0.35em] uppercase text-text-muted">
          GLCC · 4th best cycle club in Grey Lynn
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-bg-secondary border border-border-subtle p-3">
      <div className="text-[9px] tracking-[0.2em] font-bold uppercase text-text-muted">{label}</div>
      <div className="mt-1 font-black text-lg text-text-primary">{value}</div>
    </div>
  );
}
