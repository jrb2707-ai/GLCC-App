import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, ArrowLeft, Send, Search, MessageSquarePlus } from "lucide-react";
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

  // Reset back to inbox whenever the drawer re-opens fresh.
  useEffect(() => {
    if (open) {
      setView("list");
      setPeer(null);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await api.get("/dm/conversations");
      setConvos(data.conversations || []);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  }

  function openThread(p) {
    setPeer(p);
    setView("thread");
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex" data-testid="dm-drawer">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="dm-drawer-backdrop"
      />
      <div className="ml-auto relative w-full sm:w-[420px] h-full bg-bg-primary border-l border-border-subtle flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
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

function InboxList({ convos, loading, onPick, onNew }) {
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
        <button
          key={c.id}
          onClick={() => onPick(c.peer)}
          className="w-full flex items-center gap-3 px-4 py-3 border-b border-border-subtle text-left hover:bg-bg-secondary/70 transition"
          data-testid={`dm-convo-${c.id}`}
        >
          <Avatar name={c.peer.name} photo={c.peer.photo} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-bold text-text-primary truncate">{c.peer.name}</div>
              <div className="text-[10px] text-text-muted font-mono-stat uppercase tracking-widest shrink-0">{formatTs(c.last_at)}</div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`text-[12px] truncate flex-1 ${c.unread > 0 ? "text-text-primary font-semibold" : "text-text-muted"}`}>{c.last_text || "Say hi…"}</div>
              {c.unread > 0 && (
                <span className="shrink-0 px-1.5 min-w-[18px] h-[18px] rounded-full bg-accent-pink text-white text-[10px] font-black flex items-center justify-center" data-testid={`dm-unread-${c.id}`}>
                  {c.unread}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
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
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`dm-msg-${m.id}`}>
              <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-[14px] leading-snug ${mine ? "bg-accent-pink text-white rounded-br-sm" : "bg-bg-secondary text-text-primary rounded-bl-sm border border-border-subtle"}`}>
                {m.text}
                <div className={`text-[9px] mt-0.5 font-mono-stat uppercase tracking-widest ${mine ? "text-white/70" : "text-text-muted"}`}>{formatTs(m.created_at)}</div>
              </div>
            </div>
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
