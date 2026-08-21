import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { colors, radius } from "../constants/theme";
import { useAuth } from "../lib/store";
import { fmtTime } from "../lib/util";

export default function ChatTab() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [weather, setWeather] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const isPending = user?.status === "pending";

  const load = useCallback(async () => {
    try {
      const [m, w] = await Promise.all([
        isPending ? Promise.resolve({ data: { messages: [] } }) : api.get("/chat/messages"),
        api.get("/weather").catch(() => ({ data: null })),
      ]);
      setMessages(m.data?.messages || []);
      setWeather(w.data || null);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, [isPending]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isPending) return undefined;
    const id = setInterval(load, 5000); // polling; WS in Phase 3
    return () => clearInterval(id);
  }, [load, isPending]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    try {
      await api.post("/chat/messages", { text: t });
      await load();
      scrollRef.current?.scrollToEnd({ animated: true });
    } catch (e) { /* ignore */ }
    finally { setSending(false); }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accentVolt} /></View>;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#fff" }}
      keyboardVerticalOffset={80}
    >
      {/* Weather header */}
      <View style={s.weather}>
        <View style={s.weatherIcon}>
          <Text style={{ color: "#007AFF", fontSize: 16 }}>☁</Text>
        </View>
        <View>
          <Text style={s.weatherEyebrow}>
            {weather ? `${weather.location} · ${weather.wind} WIND` : "LOADING WEATHER…"}
          </Text>
          <Text style={s.weatherMain}>
            {weather ? `${weather.temp_c}°C · ${weather.condition}` : ""}
            {weather && <Text style={s.weatherRain}>  · {weather.rain_chance}% rain</Text>}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: "#fff" }}
        contentContainerStyle={{ padding: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {isPending ? (
          <View style={s.locked} testID="chat-locked">
            <Text style={s.lockedEyebrow}>CHAT LOCKED</Text>
            <Text style={s.lockedBody}>The peloton opens up once an admin approves you.</Text>
          </View>
        ) : (
          messages.map((m) => {
            if (m.system) {
              return (
                <View key={m.id} style={{ alignItems: "center", paddingVertical: 4 }}>
                  <Text style={s.systemLine}>{m.text}</Text>
                </View>
              );
            }
            const mine = m.user_id === user?.id;
            return (
              <View key={m.id} style={[s.bubbleWrap, { alignItems: mine ? "flex-end" : "flex-start" }]}>
                {!mine && (
                  <Text style={s.who}>{m.name} · {fmtTime(m.created_at)}</Text>
                )}
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                  <Text style={{ color: mine ? "#fff" : "#111", fontSize: 14 }}>{m.text}</Text>
                </View>
                {mine && <Text style={s.mineTime}>{fmtTime(m.created_at)}</Text>}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={s.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={isPending ? "Awaiting admin approval to post…" : "Message the peloton"}
          placeholderTextColor="#999"
          editable={!isPending}
          style={[s.input, isPending && { backgroundColor: "#f5f5f5", color: "#999" }]}
          onSubmitEditing={send}
          testID="chat-input"
        />
        <TouchableOpacity
          onPress={send}
          disabled={sending || !text.trim() || isPending}
          style={[s.sendBtn, (!text.trim() || sending || isPending) && { opacity: 0.4 }]}
          testID="chat-send"
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: "center", justifyContent: "center" },
  weather: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fafafa", borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  weatherIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(0,122,255,0.15)", alignItems: "center", justifyContent: "center" },
  weatherEyebrow: { color: "#666", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  weatherMain: { color: "#111", fontSize: 14, fontWeight: "700", marginTop: 2 },
  weatherRain: { color: "#666", fontSize: 12, fontWeight: "500" },

  bubbleWrap: { marginBottom: 6 },
  who: { fontSize: 10, color: "#888", marginLeft: 12, marginBottom: 2, letterSpacing: 1, textTransform: "uppercase" },
  bubble: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, maxWidth: "80%" },
  bubbleMine: { backgroundColor: "#007AFF", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#E9E9EB", borderBottomLeftRadius: 4 },
  mineTime: { fontSize: 9, color: "#aaa", marginTop: 2, marginRight: 8 },
  systemLine: { color: "#666", fontSize: 11, textAlign: "center", backgroundColor: "#f0f0f0", paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12, overflow: "hidden" },

  locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, minHeight: 300 },
  lockedEyebrow: { color: "#999", letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  lockedBody: { color: "#666", textAlign: "center", marginTop: 6, maxWidth: 240, fontSize: 13 },

  inputRow: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderTopColor: "#e5e5e5", backgroundColor: "#fafafa", gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: "#fff", borderColor: "#d0d0d0", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, color: "#111", fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center" },
});
