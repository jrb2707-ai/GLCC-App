import React from "react";
import { X, Pencil, Ban } from "lucide-react";
import { api, formatDetail } from "../lib/api";
import { toast } from "sonner";
import { usePullToDismiss } from "../lib/usePullToDismiss";
import { JerseyBadge } from "./CoffeeStats";

// Rapha-style GLCC member card. Full-screen dark modal with a floating card,
// club watermark, and permanent member number.
export default function MemberCard({ rider, onClose, onEditProfile, isBlocked, canBlock, onBlockChange }) {
  const { handlers: dragHandlers, dy, dx, dragging } = usePullToDismiss({ onDismiss: onClose, threshold: 120 });
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
  const joinedSource = rider.member_since || rider.created_at;
  const joinedLabel = joinedSource
    ? new Date(joinedSource).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";

  return (
    <div
      className="fixed inset-0 z-[60] bg-[#0e1310] flex flex-col overflow-hidden"
      data-testid="member-card-modal"
      style={{
        transform: dx || dy ? `translate(${dx}px, ${dy}px)` : undefined,
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
        className="relative z-10 flex-none flex items-center justify-between px-5 pt-3 pb-1 select-none"
        data-testid="member-card-drag-handle"
      >
        <button
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-95"
          data-testid="member-card-close"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="font-mono-stat text-[10px] uppercase tracking-[0.35em] text-white/40">
          Pull down · Member Card
        </span>
        <div className="w-8" />
      </div>

      {/* No-scroll body: card fills the available space, actions pinned to the bottom */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden px-5 pb-4" data-testid="member-card-scroll">
        {/* Card — grows to fill the gap between the header and the meta rows so
            it never looks like it's floating in dead space, on any viewport. */}
        <div className="flex-1 flex items-center justify-center min-h-0 py-3">
          <div
            className="w-full max-w-[280px] h-full max-h-[520px] aspect-[3/4.2] rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] p-5 flex flex-col items-center text-black -rotate-3"
            data-testid="member-card"
          >
            <div className="text-[10px] font-mono-stat uppercase tracking-[0.35em] text-black/50 self-start">
              GLCC ·
            </div>
            <h2 className="font-heading text-2xl font-black uppercase tracking-tight leading-none mt-1 self-start">
              {displayName}
            </h2>

            <div className="flex-1 flex items-center justify-center py-3 min-h-0">
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

        {/* Meta grid — sits right above the pinned actions. */}
        <div className="flex-none grid grid-cols-2 gap-2 pb-3">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/75">Role</div>
            <div className="font-heading text-xs font-bold uppercase text-white mt-0.5 leading-tight truncate">
              {rider.is_president ? "El Presidente" : rider.role || "Member"}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/75">Since</div>
            <div className="font-heading text-xs font-bold uppercase text-white mt-0.5 leading-tight" data-testid="member-card-since">{joinedLabel}</div>
          </div>
          {rider.top_jersey_tier && (
            <div
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 col-span-2 flex items-center gap-2"
              data-testid="member-card-jersey"
            >
              <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/75 flex-none">Jersey</div>
              <JerseyBadge tier={rider.top_jersey_tier} size="lg" />
            </div>
          )}
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 col-span-2">
            <div className="text-[9px] font-mono-stat uppercase tracking-[0.3em] text-white/75">Coffee</div>
            <div className="text-xs text-white mt-0.5 truncate">{rider.coffee || "—"}</div>
          </div>
        </div>

        {/* Actions — pinned to the bottom fold of the modal on every viewport. */}
        <div className={`flex-none ${onEditProfile && canBlock ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}`}>
          {onEditProfile && (
            <button
              onClick={onEditProfile}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent-volt text-black uppercase tracking-widest text-[11px] font-bold py-2.5"
              data-testid="member-card-edit"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
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
              className={`flex items-center justify-center gap-2 rounded-xl uppercase tracking-widest text-[11px] font-bold py-2.5 border ${
                isBlocked ? "bg-status-cant text-white border-status-cant" : "bg-status-cant/10 text-status-cant border-status-cant/40"
              }`}
              data-testid={isBlocked ? "member-card-unblock" : "member-card-block"}
            >
              <Ban className="w-3.5 h-3.5" /> {isBlocked ? "Unblock" : "Block"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
