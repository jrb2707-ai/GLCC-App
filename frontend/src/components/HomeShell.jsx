import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bike, Coffee, Users, MessageSquare, LogOut, Bell, BellOff } from "lucide-react";
import { useAuth, browserPushSupported, browserPushPermission, requestBrowserPush } from "../lib/store";
import { toast } from "sonner";
import RidesTab from "./tabs/RidesTab";
import CoffeeTab from "./tabs/CoffeeTab";
import RidersTab from "./tabs/RidersTab";
import ChatTab from "./tabs/ChatTab";
import PushBanner from "./PushBanner";

const TABS = [
  { id: "rides", label: "Rides", icon: Bike, activeClass: "text-accent-strava" },
  { id: "coffee", label: "Coffee", icon: Coffee, activeClass: "text-accent-pink" },
  { id: "riders", label: "Riders", icon: Users, activeClass: "text-white" },
  { id: "chat", label: "Chat", icon: MessageSquare, activeClass: "text-[#007AFF]" },
];

export default function HomeShell() {
  const [tab, setTab] = useState("rides");
  const { user, logout } = useAuth();
  const [perm, setPerm] = useState(browserPushPermission());

  useEffect(() => {
    setPerm(browserPushPermission());
  }, []);

  async function togglePush() {
    if (!browserPushSupported()) {
      toast.error("Your browser doesn't support notifications");
      return;
    }
    if (perm === "granted") {
      toast("Notifications are on — silence them from your browser settings");
      return;
    }
    const next = await requestBrowserPush();
    setPerm(next);
    if (next === "granted") {
      localStorage.setItem("glcc_push_banner_dismissed", "1");
      toast("Push notifications enabled", { description: "Coffee rounds and @mentions will ping you" });
    } else if (next === "denied") {
      localStorage.setItem("glcc_push_banner_dismissed", "1");
      toast.error("Notifications blocked — enable them in browser settings");
    }
  }

  const bellEnabled = perm === "granted";
  const BellIcon = bellEnabled ? Bell : BellOff;

  return (
    <div className="relative h-full w-full flex flex-col" data-testid="home-shell">
      {/* Header */}
      <div className="pt-9 pb-3 px-5 flex items-center justify-between border-b border-border-subtle bg-bg-primary/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-volt pulse-volt" />
          <span className="font-heading text-xl font-black uppercase tracking-wider">GLCC</span>
          {user?.is_admin && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-bold bg-accent-volt/15 text-accent-volt border border-accent-volt/30">
              {user.is_president ? "El Prez" : "Admin"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePush}
            title={bellEnabled ? "Notifications on" : "Enable notifications"}
            className={`p-1.5 rounded-full transition ${
              bellEnabled
                ? "text-accent-volt bg-accent-volt/10 border border-accent-volt/30"
                : "text-text-secondary hover:text-accent-volt border border-transparent"
            }`}
            data-testid="notifications-toggle"
          >
            <BellIcon className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-secondary hover:text-accent-volt"
            data-testid="logout-button"
          >
            <LogOut className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar" data-testid="tab-content">
        <PushBanner />
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {tab === "rides" && <RidesTab onNavigate={setTab} />}
            {tab === "coffee" && <CoffeeTab />}
            {tab === "riders" && <RidersTab />}
            {tab === "chat" && <ChatTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Tab bar */}
      <div className="border-t border-border-subtle bg-bg-secondary/95 backdrop-blur-xl px-2 pt-2 pb-6">
        <div className="flex justify-around">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const activeCls = t.activeClass || "text-accent-volt";
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex flex-col items-center gap-1 py-1.5 px-3 group"
                data-testid={`tab-${t.id}`}
              >
                <Icon
                  className={`w-6 h-6 transition-colors ${
                    active ? activeCls : "text-text-muted group-hover:text-text-secondary"
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={`text-[10px] font-mono-stat uppercase tracking-widest ${
                    active ? activeCls : "text-text-muted"
                  }`}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
