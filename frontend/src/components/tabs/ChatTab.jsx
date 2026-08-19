import React, { useEffect, useRef, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { Cloud, Send } from "lucide-react";
import { toast } from "sonner";

export default function ChatTab() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [messages, setMessages] = useState([]);
  const [weather, setWeather] = useState(null);
  const [text, setText] = useState("");
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [m, w] = await Promise.all([api.get("/chat/messages"), api.get("/weather")]);
      setMessages(m.data.messages);
      setWeather(w.data);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((evt) => {
      if (evt.type === "chat.message") {
        setMessages((prev) => [...prev, evt.message]);
      }
    });
  }, [subscribe]);

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
    <div className="h-full flex flex-col" data-testid="chat-tab">
      {/* Weather header */}
      <div className="px-5 pt-3 pb-3 border-b border-border-subtle bg-gradient-to-r from-bg-secondary to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-volt/15 text-accent-volt flex items-center justify-center">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <div className="font-mono-stat text-[10px] uppercase tracking-widest text-text-muted">
              {weather ? `${weather.location} · ${weather.wind} wind` : "Loading weather…"}
            </div>
            <div className="text-sm font-semibold text-text-primary">
              {weather ? `${weather.temp_c}°C · ${weather.condition}` : ""}
              {weather && (
                <span className="ml-1 text-text-secondary text-xs">· {weather.rain_chance}% rain</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-2" data-testid="chat-messages">
        {messages.map((m) => {
          if (m.system) {
            return (
              <div key={m.id} className="bg-accent-volt/10 border-l-2 border-accent-volt rounded-r-xl px-3 py-2" data-testid={`msg-${m.id}`}>
                <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-volt">
                  {m.name} · {fmtTime(m.created_at)}
                </div>
                <div className="text-sm text-text-primary mt-0.5">{m.text}</div>
              </div>
            );
          }
          const mine = m.user_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
              <div
                className={`max-w-[78%] px-3 py-2 rounded-2xl border ${
                  mine
                    ? "bg-accent-volt text-black border-accent-volt rounded-br-md"
                    : "bg-bg-secondary text-text-primary border-border-subtle rounded-bl-md"
                }`}
              >
                {!mine && (
                  <div className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted">
                    {m.name} · {fmtTime(m.created_at)}
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                {mine && (
                  <div className="text-[9px] text-black/60 font-mono-stat text-right mt-0.5">
                    {fmtTime(m.created_at)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border-subtle bg-bg-secondary/80 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message the peloton — @mention a rider"
          className="flex-1 bg-bg-primary border border-border-subtle rounded-full px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-volt/60"
          data-testid="chat-input"
        />
        <button
          onClick={send}
          className="w-11 h-11 rounded-full bg-accent-volt text-black flex items-center justify-center active:scale-95 shadow-volt"
          data-testid="chat-send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
