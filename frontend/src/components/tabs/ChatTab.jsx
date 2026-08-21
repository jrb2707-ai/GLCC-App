import React, { useEffect, useRef, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { Cloud, Send, Flag } from "lucide-react";
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
  const scrollRef = useRef(null);
  const isPending = user.status === "pending";

  const load = useCallback(async () => {
    try {
      const [m, w] = await Promise.all([api.get("/chat/messages"), api.get("/weather")]);
      setMessages(isPending ? [] : m.data.messages);
      setWeather(w.data);
    } catch (e) {
      // ignore
    }
  }, [isPending]);

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
    });
  }, [subscribe, isPending]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      await api.post("/chat/messages", { text: t });
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="h-full flex flex-col bg-white text-neutral-900 rounded-t-3xl overflow-hidden" data-testid="chat-tab">
      {/* Weather header */}
      <div className="px-5 pt-3 pb-3 border-b border-neutral-200 bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#007AFF]/15 text-[#007AFF] flex items-center justify-center">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
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
            return (
              <div key={m.id} className="text-center py-1" data-testid={`msg-${m.id}`}>
                <div className="inline-block bg-neutral-100 text-neutral-600 text-[11px] px-3 py-1 rounded-full">
                  {m.text}
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
      <div className="px-3 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isPending && send()}
          placeholder={isPending ? "Awaiting admin approval to post…" : "Message the peloton — @mention a rider"}
          disabled={isPending}
          className="flex-1 bg-white border border-neutral-300 rounded-full px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#007AFF] disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed"
          data-testid="chat-input"
        />
        <button
          onClick={send}
          disabled={isPending}
          className="w-11 h-11 rounded-full bg-[#007AFF] text-white flex items-center justify-center active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          data-testid="chat-send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
