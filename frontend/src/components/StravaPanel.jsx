import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import { toast } from "sonner";
import { RefreshCw, Zap, Unplug } from "lucide-react";

function fmtWhen(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function StravaPanel({ onSynced }) {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/strava/status");
      setStatus(data);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("strava") === "connected") {
      toast("Strava connected", { description: "Syncing club rides now…" });
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(load, 1500);
    } else if (params.get("strava") === "denied" || params.get("strava") === "error") {
      toast.error("Strava connection cancelled");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load]);

  useEffect(() => {
    return subscribe((evt) => {
      if (evt.type === "rides.synced") {
        load();
        if (onSynced) onSynced();
      }
    });
  }, [subscribe, load, onSynced]);

  if (!user?.is_admin) return null;

  async function connect() {
    try {
      const { data } = await api.get("/strava/connect");
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const { data } = await api.post("/strava/sync");
      toast(`Strava synced`, { description: `${data.synced} events · ${data.deleted} removed` });
      await load();
      if (onSynced) onSynced();
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Strava? Existing synced rides stay put, but no new events will be pulled.")) return;
    try {
      await api.post("/strava/disconnect");
      toast("Strava disconnected");
      await load();
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  const connected = status?.connected;

  return (
    <div
      className={`mx-1 mb-3 rounded-xl border p-3 flex items-center gap-3 ${
        connected
          ? "bg-[#FC4C02]/10 border-[#FC4C02]/40"
          : "bg-bg-secondary border-border-subtle border-dashed"
      }`}
      data-testid="strava-panel"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-none ${connected ? "bg-[#FC4C02] text-white" : "bg-[#FC4C02]/20 text-[#FC4C02]"}`}>
        <Zap className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
          Strava · Club {status?.club_id || "50775"}
        </div>
        <div className="text-sm font-semibold truncate">
          {connected ? `Synced · ${status.event_count} events · ${fmtWhen(status.last_sync_at)}` : "Not connected"}
        </div>
      </div>
      {connected ? (
        <div className="flex items-center gap-1">
          <button
            onClick={syncNow}
            disabled={busy}
            className="text-[10px] uppercase tracking-widest font-bold bg-[#FC4C02] text-white px-2.5 py-1.5 rounded-md active:scale-95 disabled:opacity-60 flex items-center gap-1"
            data-testid="strava-sync"
          >
            <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
            Sync
          </button>
          <button
            onClick={disconnect}
            className="text-[10px] uppercase tracking-widest text-text-muted hover:text-status-cant p-1.5"
            title="Disconnect"
            data-testid="strava-disconnect"
          >
            <Unplug className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          className="text-[10px] uppercase tracking-widest font-bold bg-[#FC4C02] text-white px-3 py-1.5 rounded-md active:scale-95"
          data-testid="strava-connect"
        >
          Connect
        </button>
      )}
    </div>
  );
}
