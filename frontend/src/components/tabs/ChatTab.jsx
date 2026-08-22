import React, { useEffect, useRef, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { Cloud, Send, Flag, Megaphone, Wrench, AtSign } from "lucide-react";
import { toast } from "sonner";

const REPORT_REASONS = [
  "Spam or scam",
  "Harassment or bullying",
  "Hate speech",
  "Sexual or explicit content",
  "Violence or threats",
  "Something else",
];

function ReportSheet({ message, onClose }) {
  const [reason, setReason] = useState(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    const finalReason = reason === "Something else" ? other.trim() : reason;
    if (!finalReason) { toast.error("Pick a reason (or add details)"); return; }
    setBusy(true);
    try {
      await api.post(`/chat/messages/${message.id}/report`, { reason: finalReason });
      toast("Thanks", { description: "The GLCC admins will review this shortly." });
      onClose();
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setBusy(false); }
  }
  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end" data-testid="report-sheet" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-10 h-1 rounded-full bg-neutral-300 mb-3" />
        <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-status-cant">Report message</div>
        <div className="text-xl font-black text-neutral-900 mt-0.5">What's wrong here?</div>
        <div className="rounded-xl bg-neutral-100 p-3 mt-3" data-testid="report-snapshot">
          <div className="text-[11px] font-bold text-neutral-500">{message.name}</div>
          <div className="text-sm text-neutral-900 mt-1 line-clamp-4">{message.text}</div>
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`w-full text-left py-2.5 px-3 rounded-lg border mt-1.5 text-[13px] ${
                reason === r ? "border-status-cant bg-status-cant/10 text-status-cant font-bold" : "border-neutral-200 text-neutral-900"
              }`}
              data-testid={`report-reason-${r.replace(/\W+/g, "-").toLowerCase()}`}
            >
              {r}
            </button>
          ))}
          {reason === "Something else" && (
            <textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tell us what happened"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 mt-2 min-h-[70px] text-sm"
              data-testid="report-other-input"
            />
          )}
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="mt-4 w-full bg-status-cant text-white rounded-xl py-3 font-black uppercase tracking-widest text-xs disabled:opacity-50"
          data-testid="report-submit"
        >
          {busy ? "…" : "Send report"}
        </button>
        <button onClick={onClose} className="mt-2 w-full py-3 text-neutral-500 uppercase tracking-widest text-xs font-bold" data-testid="report-cancel">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ChatTab() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [messages, setMessages] = useState([]);
  const [weather, setWeather] = useState(null);
  const [text, setText] = useState("");
  const [reportMessage, setReportMessage] = useState(null);
  const [announcement, setAnnouncement] = useState(false);
  const [riders, setRiders] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null); // null when picker closed, else the token after "@"
  const [mechanicalBusy, setMechanicalBusy] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const isPending = user.status === "pending";

  const load = useCallback(async () => {
    try {
      const [m, w, r] = await Promise.all([
        api.get("/chat/messages"),
        api.get("/weather"),
        api.get("/riders"),
      ]);
      setMessages(isPending ? [] : m.data.messages);
      setWeather(w.data);
      setRiders((r.data.riders || []).filter((rd) => rd.status === "approved" && rd.id !== user.id));
    } catch (e) {
      // ignore
    }
  }, [isPending, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isPending) return undefined;
    return subscribe((evt) => {
      if (evt.type === "chat.message") {
        setMessages((prev) => [...prev, evt.message]);
      }
      if (evt.type === "chat.deleted") {
        setMessages((prev) => prev.filter((m) => m.id !== evt.message_id));
      }
      if (evt.type === "chat.cleared") {
        setMessages([]);
        toast(`Chat wiped${evt.by ? ` by ${evt.by}` : ""}`);
      }
    });
  }, [subscribe, isPending]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    const wasAnnouncement = announcement;
    setAnnouncement(false);
    setMentionQuery(null);
    try {
      await api.post("/chat/messages", { text: t, announcement: wasAnnouncement });
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  async function wipe() {
    if (!window.confirm("Wipe every chat message right now? This can't be undone.")) return;
    try {
      const { data } = await api.delete("/chat/messages");
      toast(`Wiped ${data.messages_deleted} messages`);
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  async function sendMechanical() {
    if (mechanicalBusy || isPending) return;
    if (!window.confirm("Broadcast a mechanical alert to the whole club? Your current location will be shared if you grant permission.")) return;
    setMechanicalBusy(true);
    const post = async (coords) => {
      try {
        await api.post("/chat/mechanical", coords);
        toast("Mechanical broadcast sent");
      } catch (e) {
        toast.error(formatDetail(e));
      } finally {
        setMechanicalBusy(false);
      }
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => post({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => post({}), // user denied → still broadcast, just without location
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    } else {
      await post({});
    }
  }

  // Update mention query as the user types "@..."
  function onTextChange(e) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const prefix = v.slice(0, caret);
    const m = prefix.match(/@([\w\-]{0,32})$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  }

  function pickMention(rider) {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w\-]{0,32})$/, `@${rider.name.replace(/\s+/g, "")} `);
    const after = text.slice(caret);
    const next = before + after;
    setText(next);
    setMentionQuery(null);
    setTimeout(() => {
      el.focus();
      const pos = before.length;
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    }, 0);
  }

  const filteredMentions = mentionQuery !== null
    ? riders
        .filter((r) => r.name.toLowerCase().replace(/\s+/g, "").includes(mentionQuery))
        .slice(0, 6)
    : [];

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="h-full flex flex-col bg-white text-neutral-900 rounded-t-3xl overflow-hidden" data-testid="chat-tab">
      {/* Announce toggle — pinned above everything, El Prez only */}
      {user.is_president && (
        <div className="px-3 pt-3 pb-1 bg-white">
          <button
            type="button"
            onClick={() => setAnnouncement((v) => !v)}
            disabled={isPending}
            aria-pressed={announcement}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black uppercase tracking-[0.2em] text-xs active:scale-[0.98] ${announcement ? "bg-brand-accent text-black shadow-[0_4px_14px_rgba(212,255,0,0.4)]" : "bg-white text-neutral-900 border border-neutral-300"}`}
            data-testid="chat-announce-btn"
          >
            <Megaphone className="w-3.5 h-3.5" />
            {announcement ? "Announcement ON — next message pushes to all" : "Announce to all"}
          </button>
        </div>
      )}

      {/* Weather header */}
      <div className="px-5 pt-3 pb-3 border-b border-neutral-200 bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#007AFF]/15 text-[#007AFF] flex items-center justify-center">
            <Cloud className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono-stat text-[10px] uppercase tracking-widest text-neutral-500">
              {weather ? `${weather.location} · ${weather.wind} wind` : "Loading weather…"}
            </div>
            <div className="text-sm font-semibold text-neutral-900">
              {weather ? `${weather.temp_c}°C · ${weather.condition}` : ""}
              {weather && (
                <span className="ml-1 text-neutral-500 text-xs">· {weather.rain_chance}% rain</span>
              )}
            </div>
          </div>
          {user.is_admin && (
            <button
              onClick={wipe}
              className="text-[10px] font-mono-stat uppercase tracking-widest text-neutral-500 hover:text-status-cant border border-neutral-300 hover:border-status-cant rounded-full px-2.5 py-1 active:scale-95"
              title="Wipe every chat message right now"
              data-testid="chat-wipe-button"
            >
              Wipe now
            </button>
          )}
        </div>
        <div className="mt-1.5 text-[10px] text-neutral-400 font-mono-stat uppercase tracking-widest">
          Messages auto-clear after 7 days
        </div>
      </div>

      {/* Clubhouse welcome banner — permanent, glass, sits just under weather */}
      <div
        className="mx-3 mt-2 px-4 py-2.5 rounded-2xl bg-white/70 backdrop-blur-md border border-neutral-200/60 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
        data-testid="chat-clubhouse-banner"
      >
        <div className="text-[12px] leading-snug text-neutral-800">
          <span className="font-extrabold text-neutral-900">Welcome to the GLCC clubhouse.</span>{" "}
          {(() => {
            const rain = weather?.rain_chance ?? 0;
            const wind = weather?.wind_kph ?? 0;
            if (rain >= 60) {
              return (
                <span className="font-bold text-status-cant" data-testid="clubhouse-warn">
                  🌧 {rain}% rain forecast — ride may be cancelled.
                </span>
              );
            }
            if (wind >= 40) {
              return (
                <span className="font-bold text-status-cant" data-testid="clubhouse-warn">
                  💨 {wind} kph wind — ride may be cancelled.
                </span>
              );
            }
            return <span className="italic text-neutral-500">Weather check. Watch this space.</span>;
          })()}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-1.5 bg-white" data-testid="chat-messages">
        {isPending ? (
          <div className="h-full min-h-[220px] flex items-center justify-center px-6" data-testid="chat-locked">
            <div className="text-center text-neutral-500 text-xs leading-relaxed max-w-[240px]">
              <div className="text-[10px] uppercase tracking-widest font-mono-stat text-neutral-400 mb-1">
                Chat locked
              </div>
              The peloton opens up once an admin approves you.
            </div>
          </div>
        ) : messages.map((m) => {
          if (m.system) {
            const isMech = !!m.mechanical;
            const mapsLink = m.mechanical?.maps_link;
            return (
              <div key={m.id} className="text-center py-1" data-testid={`msg-${m.id}`}>
                {isMech ? (
                  <div className="inline-block max-w-[92%] bg-status-cant/10 border border-status-cant/30 text-status-cant text-[12px] px-4 py-2 rounded-2xl text-left" data-testid={`mechanical-${m.id}`}>
                    <div className="font-black uppercase tracking-widest text-[10px] mb-0.5 inline-flex items-center gap-1">
                      <Wrench className="w-3 h-3" /> Mechanical alert
                    </div>
                    <div className="text-neutral-800 text-[12.5px] leading-snug">{m.text}</div>
                    {mapsLink && (
                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-block text-[11px] font-bold underline underline-offset-2 text-status-cant"
                        data-testid={`mechanical-map-${m.id}`}
                      >
                        Open in Google Maps ↗
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="inline-block bg-neutral-100 text-neutral-600 text-[11px] px-3 py-1 rounded-full">
                    {m.text}
                  </div>
                )}
              </div>
            );
          }
          if (m.announcement) {
            return (
              <div key={m.id} className="py-1.5" data-testid={`msg-${m.id}`}>
                <div className="bg-brand-accent/15 border border-brand-accent/40 rounded-2xl px-4 py-2.5" data-testid={`announcement-${m.id}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Megaphone className="w-3.5 h-3.5 text-neutral-900" />
                    <span className="font-black text-[10px] uppercase tracking-widest text-neutral-900">
                      {m.name} · {fmtTime(m.created_at)}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-900 font-semibold leading-snug whitespace-pre-wrap break-words">
                    {m.text}
                  </div>
                </div>
              </div>
            );
          }
          const mine = m.user_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`} data-testid={`msg-${m.id}`}>
              <div className="max-w-[78%]">
                {!mine && (
                  <div className="text-[10px] uppercase font-mono-stat tracking-widest text-neutral-500 mb-0.5 ml-3">
                    {m.name} · {fmtTime(m.created_at)}
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <div
                    className={
                      mine
                        ? "px-3.5 py-2 rounded-2xl rounded-br-md bg-[#007AFF] text-white"
                        : "px-3.5 py-2 rounded-2xl rounded-bl-md bg-[#E9E9EB] text-neutral-900"
                    }
                  >
                    <div className="text-sm whitespace-pre-wrap break-words leading-snug">{m.text}</div>
                  </div>
                  {!mine && (
                    <button
                      onClick={() => setReportMessage(m)}
                      className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity mt-1 p-1 rounded text-neutral-500 hover:text-status-cant"
                      title="Report this message"
                      data-testid={`report-open-${m.id}`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {mine && (
                  <div className="text-[9px] text-neutral-400 font-mono-stat text-right mt-0.5 mr-2">
                    {fmtTime(m.created_at)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {reportMessage && <ReportSheet message={reportMessage} onClose={() => setReportMessage(null)} />}

      {/* Input */}
      <div className="border-t border-neutral-200 bg-neutral-50">
        {filteredMentions.length > 0 && (
          <div
            className="max-h-40 overflow-y-auto no-scrollbar bg-white border-b border-neutral-200 shadow-sm"
            data-testid="chat-mention-picker"
          >
            {filteredMentions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pickMention(r)}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-neutral-50 active:bg-neutral-100 text-left"
                data-testid={`chat-mention-${r.id}`}
              >
                <AtSign className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-sm font-bold text-neutral-900">{r.name}</span>
                <span className="text-[11px] text-neutral-500 uppercase tracking-widest ml-auto">
                  {r.role || "Member"}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="px-3 pt-1.5 pb-1">
          <button
            type="button"
            onClick={sendMechanical}
            disabled={isPending || mechanicalBusy}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black uppercase tracking-[0.22em] text-sm text-white bg-status-cant shadow-[0_4px_18px_rgba(239,68,68,0.45)] ring-2 ring-status-cant/40 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${mechanicalBusy ? "" : "animate-emergency-pulse"}`}
            data-testid="chat-mechanical-btn"
          >
            <Wrench className="w-4 h-4" />
            {mechanicalBusy ? "Broadcasting…" : "I've a mechanical"}
          </button>
        </div>
        <div className="px-3 py-3 flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={onTextChange}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMentionQuery(null);
              if (e.key === "Enter" && !isPending) send();
            }}
            placeholder={
              isPending
                ? "Awaiting admin approval to post…"
                : announcement
                ? "Post an announcement — everyone gets a push"
                : "Message the peloton — @mention a rider"
            }
            disabled={isPending}
            className={`flex-1 border rounded-full px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed ${announcement ? "bg-brand-accent/10 border-brand-accent focus:border-brand-accent" : "bg-white border-neutral-300 focus:border-[#007AFF]"}`}
            data-testid="chat-input"
          />
          <button
            onClick={send}
            disabled={isPending}
            className={`w-11 h-11 rounded-full text-white flex items-center justify-center active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${announcement ? "bg-black" : "bg-[#007AFF]"}`}
            data-testid="chat-send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
