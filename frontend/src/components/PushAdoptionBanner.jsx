import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { isWebPushSupported, webPushPermission, registerWebPush } from "../lib/webpush";
import { toast } from "sonner";

const DISMISS_KEY = "glcc.pushBanner.dismissed";

/**
 * Nudge riders to enable browser push notifications. Renders only if:
 *  - the browser supports Web Push,
 *  - Notification permission is still "default" (never granted, never denied),
 *  - the rider hasn't dismissed the banner before.
 */
export default function PushAdoptionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isWebPushSupported()) return;
    if (webPushPermission() !== "default") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const sub = await registerWebPush({ silent: false });
      if (sub) {
        toast("Push notifications ON", {
          description: "You'll get pinged for mechanicals, weather and announcements.",
        });
        setVisible(false);
      } else if (webPushPermission() === "denied") {
        toast.error(
          "Notifications blocked — turn them on in your browser's site settings for greylynncc.com",
        );
      } else {
        toast.error("Couldn't enable push — try again or check your browser settings");
      }
    } catch (e) {
      toast.error("Push setup failed — try again");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="border-b border-accent-strava/30 bg-accent-strava/5"
      data-testid="push-adoption-banner"
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent-strava/15 text-accent-strava shrink-0">
            <Bell className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-mono-stat uppercase tracking-widest font-bold text-text-primary">
              Turn on push
            </div>
            <div className="text-[11px] text-text-secondary leading-tight">
              Get pinged for mechanicals, weather & announcements
            </div>
          </div>
        </div>
        <button
          onClick={enable}
          disabled={busy}
          className="text-[11px] font-black uppercase tracking-widest bg-accent-strava text-white px-3 py-1.5 rounded-full shrink-0 disabled:opacity-40"
          data-testid="push-adoption-enable"
        >
          {busy ? "…" : "Enable"}
        </button>
        <button
          onClick={dismiss}
          className="p-1 rounded-full text-text-muted hover:text-text-primary shrink-0"
          data-testid="push-adoption-dismiss"
          aria-label="Dismiss push banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
