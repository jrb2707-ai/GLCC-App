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
        {messages.map((m) => {
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
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
              <div className="max-w-[78%]">
                {!mine && (
                  <div className="text-[10px] uppercase font-mono-stat tracking-widest text-neutral-500 mb-0.5 ml-3">
                    {m.name} · {fmtTime(m.created_at)}
                  </div>
                )}
                <div
                  className={
                    mine
                      ? "px-3.5 py-2 rounded-2xl rounded-br-md bg-[#007AFF] text-white"
                      : "px-3.5 py-2 rounded-2xl rounded-bl-md bg-[#E9E9EB] text-neutral-900"
                  }
                >
                  <div className="text-sm whitespace-pre-wrap break-words leading-snug">{m.text}</div>
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

      {/* Input */}
      <div className="px-3 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message the peloton — @mention a rider"
          className="flex-1 bg-white border border-neutral-300 rounded-full px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#007AFF]"
          data-testid="chat-input"
        />
        <button
          onClick={send}
          className="w-11 h-11 rounded-full bg-[#007AFF] text-white flex items-center justify-center active:scale-95"
          data-testid="chat-send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
