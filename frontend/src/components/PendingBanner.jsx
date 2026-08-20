import React from "react";
import { Hourglass } from "lucide-react";
import { useAuth } from "../lib/store";

export default function PendingBanner() {
  const { user } = useAuth();
  if (!user || user.status !== "pending") return null;
  return (
    <div
      className="mx-4 mt-3 mb-1 flex items-start gap-2.5 rounded-xl border border-status-maybe/40 bg-status-maybe/10 px-3 py-2.5"
      data-testid="pending-banner"
    >
      <Hourglass className="w-4 h-4 text-status-maybe flex-none mt-0.5" />
      <div className="min-w-0">
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-status-maybe">
          Awaiting approval
        </div>
        <div className="text-xs text-text-secondary leading-snug mt-0.5">
          An admin needs to approve you before you can RSVP, order coffee or chat. Feel free to
          have a look around.
        </div>
      </div>
    </div>
  );
}
