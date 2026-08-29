import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, ArrowLeft, Send, Search, MessageSquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import Avatar from "./Avatar";

// Overlay drawer accessible from the mail icon in the header. Two states:
//   list  → shows all conversations + "new message" affordance
//   thread → chat bubble UI for a single peer
// Blocking is server-enforced; the list simply won't include blocked peers.
export default function DMDrawer({ open, onClose }) {
  const [view, setView] = useState("list"); // list | thread | pick
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [peer, setPeer] = useState(null);
  const { subscribe } = useEvents();

  // Reset back to inbox whenever the drawer re-opens fresh.
  useEffect(() => {
    if (open) {
      setView("list");
      setPeer(null);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cross-tab / cross-device inbox sync — if the other party deletes the
  // convo or we delete it on another device, drop the row here too.
  useEffect(() => {
    return subscribe((evt) => {
      if (evt.type !== "dm.convo.deleted") return;
      setConvos((cur) => cur.filter((c) => c.id !== evt.conversation_id));
      // If we were staring at that thread when it died, bounce back.
      setView((v) => (v === "thread" && peer && String(peer.id) === String(evt.peer_id) ? "list" : v));
    });
  }, [subscribe, peer]);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await api.get("/dm/conversations");
      setConvos(data.conversations || []);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  }

  async function deleteConvo(convoId, peerId) {
    // Optimistic — pull row now, rollback on failure.
    const prev = convos;
    setConvos((cur) => cur.filter((c) => c.id !== convoId));
    try {
      await api.delete(`/dm/conversations/${peerId}`);
      toast.success("Conversation deleted");
    } catch (e) {
      setConvos(prev);
      toast.error(formatDetail(e));
    }
  }

  function openThread(p) {
    setPeer(p);
    setView("thread");
  }

  // Pull-down-to-close. Only active on the drawer surface (backdrop already
  // closes on tap), disabled while inside a thread's scrolled message list.
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef({ y: 0, active: false });
  const onDragStart = (e) => {
    // Only start when the user grabs the header/grabber area at the top of
    // the drawer — prevents fighting with the message list scroll.
    const t = e.touches ? e.touches[0] : e;
    dragStartRef.current = { y: t.clientY, active: true };
  };
  const onDragMove = (e) => {
    if (!dragStartRef.current.active) return;
    const t = e.touches ? e.touches[0] : e;
    const dy = t.clientY - dragStartRef.current.y;
    if (dy > 0) setDragY(Math.min(dy, 320));
  };
  const onDragEnd = () => {
    if (!dragStartRef.current.active) return;
    dragStartRef.current.active = false;
    if (dragY > 90) {
      setDragY(0);
      onClose?.();
    } else {
      setDragY(0);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex" data-testid="dm-drawer">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="dm-drawer-backdrop"
      />
      <div
        className="ml-auto relative w-full sm:w-[420px] h-full bg-bg-primary border-l border-border-subtle flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragStartRef.current.active ? "none" : "transform 180ms ease-out",
        }}
      >
        {/* Grabber strip — the whole thing is the drag handle so a natural
            "pull down" from the top edge dismisses the drawer. */}
        <div
          className="w-full pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-pan-y"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onMouseDown={onDragStart}
          onMouseMove={(e) => dragStartRef.current.active && onDragMove(e)}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
          data-testid="dm-drawer-grabber"
        >
          <div className="w-10 h-1 rounded-full bg-border-subtle" />
        </div>
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-border-subtle"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
        >
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <button
                onClick={() => setView("list")}
                className="p-1.5 -ml-1.5 text-text-secondary hover:text-text-primary"
                data-testid="dm-back"
                aria-label="Back to inbox"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-heading text-lg font-black uppercase tracking-wider">
              {view === "thread" && peer ? peer.name : view === "pick" ? "New Message" : "Direct Messages"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary"
            data-testid="dm-close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {view === "list" && (
            <InboxList
              convos={convos}
              loading={loading}
              onPick={openThread}
              onNew={() => setView("pick")}
              onDelete={deleteConvo}
            />
          )}
          {view === "pick" && (
            <PickRider onPick={openThread} />
          )}
          {view === "thread" && peer && (
            <Thread peer={peer} onMutate={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}

function InboxList({ convos, loading, onPick, onNew, onDelete }) {
  return (
    <div className="h-full overflow-y-auto">
      <button
        onClick={onNew}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-border-subtle text-left hover:bg-bg-secondary/70 transition"
        data-testid="dm-new"
      >
        <div className="w-10 h-10 rounded-full bg-accent-pink/15 border border-accent-pink/30 flex items-center justify-center text-accent-pink">
          <MessageSquarePlus className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-text-primary">New message</div>
          <div className="text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">Message any rider directly</div>
        </div>
      </button>
      {loading && (
        <div className="p-6 text-center text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">Loading…</div>
      )}
      {!loading && convos.length === 0 && (
        <div className="p-8 text-center">
          <div className="text-sm text-text-primary font-bold mb-1">No messages yet</div>
          <div className="text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">Tap "New message" to start a DM</div>
        </div>
      )}
      {convos.map((c) => (
        <ConvoRow
          key={c.id}
          convo={c}
          onPick={() => onPick(c.peer)}
          onDelete={() => onDelete?.(c.id, c.peer.id)}
        />
      ))}
    </div>
  );
}

// Swipe-left on a conversation row surfaces a red "delete conversation"
// icon. Past 60px the delete button locks armed; a second tap commits.
// Desktop users get a hover-only trash icon on the right edge.
function ConvoRow({ convo, onPick, onDelete }) {
  const [dx, setDx] = useState(0);
  const [armed, setArmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const startRef = useRef({ x: 0, y: 0, active: false });

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchMove = (e) => {
    if (!startRef.current.active) return;
    const t = e.touches[0];
    const rawDx = t.clientX - startRef.current.x;
    const rawDy = t.clientY - startRef.current.y;
    if (Math.abs(rawDy) > Math.abs(rawDx)) return;
    if (rawDx > 0) return;
    setDx(Math.max(-80, rawDx));
  };
  const onTouchEnd = () => {
    if (!startRef.current.active) return;
    startRef.current.active = false;
    if (dx < -50) { setDx(-80); setArmed(true); }
    else { setDx(0); setArmed(false); }
  };

  function askDelete(e) {
    e?.stopPropagation();
    setConfirming(true);
  }
  function confirmDelete(e) {
    e?.stopPropagation();
    onDelete?.();
    setConfirming(false);
    setDx(0);
    setArmed(false);
  }
  function cancelDelete(e) {
    e?.stopPropagation();
    setConfirming(false);
    setDx(0);
    setArmed(false);
  }

  return (
    <div
      className="relative select-none group border-b border-border-subtle"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseLeave={() => { if (armed && !confirming) { setDx(0); setArmed(false); } }}
      data-testid={`dm-convo-row-${convo.id}`}
    >
      {/* Left-of-swipe: red delete affordance */}
      <button
        type="button"
        onClick={confirming ? confirmDelete : askDelete}
        className={`absolute inset-y-0 right-0 flex items-center justify-center gap-1 px-4 bg-status-cant text-white text-[10px] font-black uppercase tracking-widest transition-opacity ${armed || confirming ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        data-testid={`dm-convo-delete-${convo.id}`}
        aria-label="Delete conversation"
      >
        <Trash2 className="w-4 h-4" />
        {confirming ? "Confirm" : ""}
      </button>
      <div
        style={{ transform: `translateX(${dx}px)`, transition: startRef.current.active ? "none" : "transform 140ms ease-out" }}
      >
        <button
          onClick={onPick}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary/70 transition bg-bg-primary"
          data-testid={`dm-convo-${convo.id}`}
        >
          <Avatar name={convo.peer.name} photo={convo.peer.photo} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-bold text-text-primary truncate">{convo.peer.name}</div>
              <div className="text-[10px] text-text-muted font-mono-stat uppercase tracking-widest shrink-0">{formatTs(convo.last_at)}</div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`text-[12px] truncate flex-1 ${convo.unread > 0 ? "text-text-primary font-semibold" : "text-text-muted"}`}>{convo.last_text || "Say hi…"}</div>
              {convo.unread > 0 && (
                <span className="shrink-0 px-1.5 min-w-[18px] h-[18px] rounded-full bg-accent-pink text-white text-[10px] font-black flex items-center justify-center" data-testid={`dm-unread-${convo.id}`}>
                  {convo.unread}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
      {/* Desktop hover-only trash pill so mouse users can delete too. */}
      <button
        type="button"
        onClick={confirming ? confirmDelete : askDelete}
        className={`hidden sm:flex absolute top-1/2 -translate-y-1/2 right-2 items-center justify-center w-7 h-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-status-cant transition ${armed || confirming ? "opacity-0" : ""}`}
        aria-label="Delete conversation"
        data-testid={`dm-convo-desktop-delete-${convo.id}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {confirming && (
        <div className="absolute inset-0 bg-bg-primary/95 flex items-center justify-center gap-2 px-4">
          <span className="text-[11px] text-text-primary font-semibold flex-1 truncate">
            Delete convo with {convo.peer.name}?
          </span>
          <button
            onClick={cancelDelete}
            className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-full border border-border-subtle text-text-secondary"
            data-testid={`dm-convo-delete-cancel-${convo.id}`}
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-full bg-status-cant text-white"
            data-testid={`dm-convo-delete-confirm-${convo.id}`}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function PickRider({ onPick }) {
  const [riders, setRiders] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/riders");
        // Approved riders only, exclude self.
        const list = (data.riders || []).filter(
          (r) => r.status === "approved" && String(r.id) !== String(user?.id),
        );
        setRiders(list);
      } catch (_) { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [user?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return riders;
    return riders.filter((r) => (r.name || "").toLowerCase().includes(needle));
  }, [q, riders]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border-subtle">
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-subtle rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search riders…"
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted"
            data-testid="dm-search"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-6 text-center text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">Loading riders…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">No riders match</div>
        )}
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick({ id: r.id, name: r.name, photo: r.photo, role: r.role })}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border-subtle text-left hover:bg-bg-secondary/70 transition"
            data-testid={`dm-pick-${r.id}`}
          >
            <Avatar name={r.name} photo={r.photo} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-primary truncate">{r.name}</div>
              <div className="text-[10px] text-text-muted font-mono-stat uppercase tracking-widest">{r.role || "Member"}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Thread({ peer, onMutate }) {
  const { user } = useAuth();
  const { subscribe, wsSend } = useEvents();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  // Announce focus so backend skips push for messages arriving in this
  // thread while we're staring at it.
  useEffect(() => {
    wsSend({ type: "dm.focus", peer_id: peer.id });
    return () => wsSend({ type: "dm.blur" });
  }, [peer.id, wsSend]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/dm/conversations/${peer.id}`);
        if (cancelled) return;
        setMessages(data.messages || []);
        // Mark read as soon as we land in the thread.
        try { await api.post(`/dm/conversations/${peer.id}/read`); } catch (_) { /* ignore */ }
        onMutate?.();
      } catch (e) {
        toast.error(formatDetail(e));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [peer.id]);  // eslint-disable-line

  useEffect(() => {
    return subscribe((evt) => {
      if (evt.type === "dm.deleted") {
        setMessages((cur) => cur.filter((m) => m.id !== evt.message_id));
        return;
      }
      if (evt.type !== "dm.message") return;
      const msg = evt.message;
      if (!msg) return;
      const involves = (msg.sender_id === peer.id && msg.recipient_id === user?.id)
        || (msg.recipient_id === peer.id && msg.sender_id === user?.id);
      if (!involves) return;
      setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
      // Auto-mark read since we're in-thread.
      if (msg.sender_id === peer.id) {
        api.post(`/dm/conversations/${peer.id}/read`).catch(() => {});
      }
    });
  }, [subscribe, peer.id, user?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/dm/conversations/${peer.id}/messages`, { text: t });
      setMessages((cur) => (cur.some((m) => m.id === data.message.id) ? cur : [...cur, data.message]));
      setText("");
      onMutate?.();
    } catch (e) {
      toast.error(formatDetail(e));
    } finally { setBusy(false); }
  }

  async function removeMessage(msg) {
    // Optimistic — the WS `dm.message.deleted` event will re-sync everyone
    // else's thread. If the server rejects (e.g. someone else's message)
    // we roll back and surface the reason.
    const prev = messages;
    setMessages((cur) => cur.filter((m) => m.id !== msg.id));
    try {
      await api.delete(`/dm/messages/${msg.id}`);
      onMutate?.();
    } catch (e) {
      setMessages(prev);
      toast.error(formatDetail(e));
    }
  }

  return (
    <div className="h-full flex flex-col" data-testid="dm-thread">
      <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2">
        <Avatar name={peer.name} photo={peer.photo} size="sm" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-text-primary truncate">{peer.name}</div>
          <div className="text-[10px] text-text-muted font-mono-stat uppercase tracking-widest">{peer.role || "Member"}</div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <div className="text-center text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">Loading…</div>}
        {!loading && messages.length === 0 && (
          <div className="text-center py-10 text-[11px] text-text-muted font-mono-stat uppercase tracking-widest">Say hi 👋</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <SwipeRow
              key={m.id}
              mine={mine}
              onDelete={mine ? () => removeMessage(m) : null}
              testId={`dm-msg-${m.id}`}
            >
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-[14px] leading-snug ${mine ? "bg-accent-pink text-white rounded-br-sm" : "bg-bg-secondary text-text-primary rounded-bl-sm border border-border-subtle"}`}>
                  {m.text}
                  <div className={`text-[9px] mt-0.5 font-mono-stat uppercase tracking-widest ${mine ? "text-white/70" : "text-text-muted"}`}>{formatTs(m.created_at)}</div>
                </div>
              </div>
            </SwipeRow>
          );
        })}
      </div>
      <div className="p-3 border-t border-border-subtle flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Message…"
          maxLength={2000}
          className="flex-1 bg-bg-secondary border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-pink outline-none"
          data-testid="dm-input"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="bg-accent-pink text-white rounded-xl p-2.5 disabled:opacity-40 active:scale-95"
          data-testid="dm-send"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function formatTs(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const diff = (now - d) / (1000 * 60 * 60 * 24);
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Swipe-left (on my own messages) or the desktop-friendly hover-and-tap
// path reveals a red delete button. On mobile, dragging past 60px arms
// the tap-to-confirm state; a second tap on the button commits. Anywhere
// else in the app cancels.
function SwipeRow({ children, mine, onDelete, testId }) {
  const [dx, setDx] = useState(0);
  const [armed, setArmed] = useState(false);
  const startRef = useRef({ x: 0, y: 0, active: false });
  const swipable = !!onDelete;

  const onTouchStart = (e) => {
    if (!swipable) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchMove = (e) => {
    if (!startRef.current.active) return;
    const t = e.touches[0];
    const rawDx = t.clientX - startRef.current.x;
    const rawDy = t.clientY - startRef.current.y;
    // Only claim the gesture when it's clearly horizontal-left.
    if (Math.abs(rawDy) > Math.abs(rawDx)) return;
    if (rawDx > 0) return;
    setDx(Math.max(-72, rawDx));
  };
  const onTouchEnd = () => {
    if (!startRef.current.active) return;
    startRef.current.active = false;
    if (dx < -50) { setDx(-72); setArmed(true); }
    else { setDx(0); setArmed(false); }
  };

  return (
    <div
      className="relative select-none group"
      data-testid={testId}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseLeave={() => { if (armed) { setDx(0); setArmed(false); } }}
    >
      {swipable && (
        <button
          type="button"
          onClick={() => { onDelete(); setArmed(false); setDx(0); }}
          className={`absolute inset-y-0 right-0 flex items-center justify-center gap-1 px-3 rounded-2xl bg-status-cant text-white text-[11px] font-black uppercase tracking-widest transition-opacity ${armed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          data-testid={`${testId}-delete`}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      )}
      <div
        style={{ transform: `translateX(${dx}px)`, transition: startRef.current.active ? "none" : "transform 120ms ease-out" }}
      >
        {children}
      </div>
      {/* Desktop affordance: a tiny trash pill lives on the bubble for mouse
          users (no touch → no swipe). Hidden on touch/small screens where
          swipe is the primary path. */}
      {swipable && (
        <button
          type="button"
          onClick={onDelete}
          className={`hidden sm:flex absolute top-1 ${mine ? "right-1" : "left-1"} items-center justify-center w-6 h-6 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-status-cant transition`}
          aria-label="Delete message"
          data-testid={`${testId}-desktop-delete`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
