import React from "react";
import { X, Pencil, Ban } from "lucide-react";
import { api, formatDetail } from "../lib/api";
import { toast } from "sonner";
import { usePullToDismiss } from "../lib/usePullToDismiss";

// Rapha-style GLCC member card. Full-screen dark modal with a floating card,
// club watermark, and permanent member number.
export default function MemberCard({ rider, onClose, onEditProfile, isBlocked, canBlock, onBlockChange }) {
  const { handlers: dragHandlers, dy, dragging } = usePullToDismiss({ onDismiss: onClose, threshold: 120 });
  if (!rider) return null;
  const initials = (rider.name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const shortLast = (rider.name || "").trim().split(/\s+/).slice(-1)[0]?.[0] || "";
  const firstName = (rider.name || "").trim().split(/\s+/)[0] || "";
  const displayName = `${firstName.toUpperCase()} ${shortLast.toUpperCase()}.`;
  const memberNo = rider.member_no != null ? String(rider.member_no).padStart(4, "0") : "—";
  const joinedLabel = rider.created_at
    ? new Date(rider.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";

  return (
    <div
      className="absolute inset-0 z-50 bg-[#0e1310] flex flex-col overflow-hidden"
      data-testid="member-card-modal"
      style={{
        transform: dy ? `translateY(${dy}px)` : undefined,
        transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.9, 0.4, 1)",
      }}
    >
      {/* Watermark */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      >
        <div className="font-heading text-[38vw] font-black uppercase text-white/[0.035] whitespace-nowrap tracking-tighter">
          GLCC
        </div>
      </div>

      {/* Top bar (also acts as pull-to-dismiss handle) */}
      <div
        {...dragHandlers}
        className="relative z-10 flex-none flex items-center justify-between px-5 pt-6 pb-3 select-none"
        data-testid="member-card-drag-handle"
      >
        <button
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-95"
          data-testid="member-card-close"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="font-mono-stat text-[10px] uppercase tracking-[0.35em] text-white/40">
          Pull down · Member Card
        </span>
        <div className="w-9" />
      </div>

      {/* Scrollable body */}
      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar" data-testid="member-card-scroll">
        {/* Card */}
        <div className="flex items-center justify-center px-6 py-8">
          <div
            className="w-full max-w-[280px] aspect-[3/4.4] rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] p-6 flex flex-col items-center text-black -rotate-3"
            data-testid="member-card"
          >
            <div className="text-[10px] font-mono-stat uppercase tracking-[0.35em] text-black/50 self-start">
              GLCC ·
            </div>
            <h2 className="font-heading text-3xl font-black uppercase tracking-tight leading-none mt-1 self-start">
              {displayName}
            </h2>

            <div className="flex-1 flex items-center justify-center py-4">
              {rider.photo ? (
                <img src={rider.photo} alt={rider.name} className="w-28 h-28 rounded-full object-cover border-4 border-black" />
              ) : (
                <div className="w-28 h-28 rounded-full bg-black text-white flex items-center justify-center font-heading text-3xl font-black">
                  {initials}
                </div>
              )}
            </div>

            <div className="w-full flex items-end justify-between">
              <div>
                <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-black/50">Member</div>
                <div className="font-heading text-xl font-black tabular-nums leading-none" data-testid="member-card-number">
                  #{memberNo}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-black/50">Chapter</div>
                <div className="font-heading text-sm font-black uppercase leading-none tracking-tight">Grey Lynn</div>
              </div>
            </div>
          </div>
        </div>

        {/* Meta rows */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-10 pt-2">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/40">Member No.</div>
            <div className="font-heading text-2xl font-black tabular-nums text-white mt-1">#{memberNo}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/40">Role</div>
            <div className="font-heading text-sm font-bold uppercase text-white mt-1 leading-tight truncate">
              {rider.is_president ? "El Presidente" : rider.role || "Member"}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/40">Since</div>
            <div className="font-heading text-sm font-bold uppercase text-white mt-1 leading-tight" data-testid="member-card-since">{joinedLabel}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/40">Chapter</div>
            <div className="font-heading text-sm font-bold uppercase text-white mt-1 leading-tight">Grey Lynn</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 col-span-2">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/40">Coffee</div>
            <div className="text-sm text-white mt-1">{rider.coffee || "—"}</div>
          </div>
          {onEditProfile && (
            <button
              onClick={onEditProfile}
              className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-accent-volt text-black uppercase tracking-widest text-xs font-bold py-3 mt-1"
              data-testid="member-card-edit"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit profile
            </button>
          )}
          {canBlock && (
            <button
              onClick={async () => {
                try {
                  if (isBlocked) {
                    await api.delete(`/blocks/${rider.id}`);
                    toast("Unblocked");
                  } else {
                    if (!window.confirm("Block this rider? You won't see their chat messages and they can't @mention you.")) return;
                    await api.post("/blocks", { target_id: rider.id });
                    toast("Blocked");
                  }
                  await onBlockChange?.();
                  if (!isBlocked) onClose?.();
                } catch (e) { toast.error(formatDetail(e)); }
              }}
              className={`col-span-2 flex items-center justify-center gap-2 rounded-xl uppercase tracking-widest text-xs font-bold py-3 mt-1 border ${
                isBlocked ? "bg-status-cant text-white border-status-cant" : "bg-status-cant/10 text-status-cant border-status-cant/40"
              }`}
              data-testid={isBlocked ? "member-card-unblock" : "member-card-block"}
            >
              <Ban className="w-3.5 h-3.5" /> {isBlocked ? "Blocked · tap to unblock" : "Block this rider"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
