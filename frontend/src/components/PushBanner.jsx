import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { browserPushSupported, browserPushPermission, requestBrowserPush } from "../lib/store";

const DISMISS_KEY = "glcc_push_banner_dismissed";

export default function PushBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!browserPushSupported()) return;
    if (browserPushPermission() !== "default") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    // Small delay so the banner slides in after the home shell settles
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  async function enable() {
    const next = await requestBrowserPush();
    if (next === "granted") {
      toast("Push notifications enabled", { description: "Coffee rounds and @mentions will ping you" });
    } else if (next === "denied") {
      toast.error("Notifications blocked — enable them in browser settings");
    }
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-4 mt-3 mb-3 rounded-2xl border border-accent-pink/40 bg-accent-pink backdrop-blur-sm p-3 flex items-start gap-3 relative shadow-pink"
          data-testid="push-banner"
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center flex-none">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <div className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Don&apos;t miss the round
            </div>
            <div className="text-[11px] text-white/85 leading-snug mt-0.5">
              Turn on pings for coffee rounds and @mentions.
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={enable}
                className="bg-white text-accent-pink text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg active:scale-[0.98]"
                data-testid="push-banner-enable"
              >
                Turn on pings
              </button>
              <button
                onClick={dismiss}
                className="text-[11px] uppercase tracking-widest text-white/80 px-2 py-1.5"
                data-testid="push-banner-dismiss"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="absolute top-2 right-2 text-white/70 hover:text-white p-1"
            aria-label="Dismiss"
            data-testid="push-banner-close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
