import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Alert,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { colors, radius } from "../constants/theme";
import { useAuth, useEvents } from "../lib/store";
import { fmtTime } from "../lib/util";
import Avatar from "../components/Avatar";
import { readCache } from "../lib/cache";

// Turn "Jason Bryant" into "JasonBryant" so the mention token is a single word.
function toHandle(name) {
  return String(name || "").replace(/[^\p{L}\p{N}]/gu, "");
}

const REPORT_REASONS = [
  "Spam or scam",
  "Harassment or bullying",
  "Hate speech",
  "Sexual or explicit content",
  "Violence or threats",
  "Something else",
];

export default function ChatTab() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [messages, setMessages] = useState([]);
  const [weather, setWeather] = useState(null);
  const [text, setText] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [riders, setRiders] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null); // null | { start, term }
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reportMessage, setReportMessage] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const isPending = user?.status === "pending";

  const load = useCallback(async () => {
    try {
      const [m, w, r] = await Promise.all([
        isPending ? Promise.resolve({ data: { messages: [] } }) : api.get("/chat/messages"),
        api.get("/weather").catch(() => ({ data: null })),
        api.get("/riders").catch(() => ({ data: { riders: [] } })),
      ]);
      setMessages(m.data?.messages || []);
      setWeather(w.data || null);
      setRiders(r.data?.riders || []);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, [isPending]);

  useEffect(() => {
    // Warm messages + roster from cache so the peloton feed appears instantly
    (async () => {
      const cachedRiders = await readCache("riders");
      if (cachedRiders) setRiders(cachedRiders);
    })();
    load();
  }, [load]);

  // Live updates via WebSocket — no polling needed anymore.
  useEffect(() => {
    if (isPending) return undefined;
    return subscribe((evt) => {
      if (evt.type === "chat.message" && evt.message) {
        setMessages((prev) => (prev.some((m) => m.id === evt.message.id) ? prev : [...prev, evt.message]));
      }
      if (evt.type === "chat.deleted" && evt.message_id) {
        setMessages((prev) => prev.filter((m) => m.id !== evt.message_id));
      }
    });
  }, [subscribe, isPending]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    setMentionQuery(null);
    try {
      // Server broadcasts the new message via WS, so we don't need to reload.
      await api.post("/chat/messages", { text: t });
      scrollRef.current?.scrollToEnd({ animated: true });
    } catch (e) { /* ignore */ }
    finally { setSending(false); }
  }

  // Detect an @token being typed just before the caret so we can offer
  // a rider list to autocomplete against.
  function detectMention(next, selStart) {
    const before = next.slice(0, selStart);
    const m = /(^|\s)@([\p{L}\p{N}]*)$/u.exec(before);
    if (!m) { setMentionQuery(null); return; }
    setMentionQuery({ start: selStart - m[2].length - 1, term: m[2].toLowerCase() });
  }

  function onChangeText(next) {
    setText(next);
    detectMention(next, selection.start || next.length);
  }

  function onSelectionChange(e) {
    const sel = e.nativeEvent.selection;
    setSelection(sel);
    detectMention(text, sel.start);
  }

  function insertMention(rider) {
    if (!mentionQuery) return;
    const handle = toHandle(rider.name);
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(selection.start ?? text.length);
    const next = `${before}@${handle} ${after}`;
    setText(next);
    setMentionQuery(null);
    // Give focus a beat to reclaim the input so the user can keep typing.
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function triggerMentionPicker() {
    const nextText = text + (text && !text.endsWith(" ") ? " @" : "@");
    setText(nextText);
    setMentionQuery({ start: nextText.length - 1, term: "" });
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  const mentionCandidates = mentionQuery
    ? riders
        .filter((r) => r.id !== user?.id && r.status !== "invited")
        .filter((r) => !mentionQuery.term || String(r.name || "").toLowerCase().includes(mentionQuery.term))
        .slice(0, 8)
    : [];

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

      {/* Sticky clubhouse welcome banner */}
      <View style={s.clubhouseBanner} testID="chat-clubhouse-banner">
        <Text style={s.clubhouseText}>
          <Text style={s.clubhouseBold}>Welcome to the GLCC clubhouse.</Text>{" "}
          {(() => {
            const rain = weather?.rain_chance ?? 0;
            const wind = weather?.wind_kph ?? 0;
            if (rain >= 60) {
              return (
                <Text style={s.clubhouseWarn} testID="clubhouse-warn">
                  🌧  {rain}% rain forecast — ride may be cancelled.
                </Text>
              );
            }
            if (wind >= 40) {
              return (
                <Text style={s.clubhouseWarn} testID="clubhouse-warn">
                  💨  {wind} kph wind — ride may be cancelled.
                </Text>
              );
            }
            return (
              <Text style={s.clubhouseMuted}>Weather check. Watch this space.</Text>
            );
          })()}
        </Text>
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
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.8}
                onLongPress={() => { if (!mine) setReportMessage(m); }}
                delayLongPress={350}
                testID={`chat-message-${m.id}`}
              >
                <View style={[s.bubbleWrap, { alignItems: mine ? "flex-end" : "flex-start" }]}>
                  {!mine && (
                    <Text style={s.who}>{m.name} · {fmtTime(m.created_at)}</Text>
                  )}
                  <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                    <Text style={{ color: mine ? "#fff" : "#111", fontSize: 14 }}>{m.text}</Text>
                  </View>
                  {mine && <Text style={s.mineTime}>{fmtTime(m.created_at)}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {reportMessage && (
        <ReportModal
          message={reportMessage}
          onClose={() => setReportMessage(null)}
        />
      )}

      {mentionCandidates.length > 0 && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={s.mentionRow}
          contentContainerStyle={{ paddingHorizontal: 10, gap: 8, alignItems: "center" }}
          testID="mention-picker"
        >
          <Text style={s.mentionEyebrow}>MENTION</Text>
          {mentionCandidates.map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => insertMention(r)}
              style={s.mentionChip}
              testID={`mention-${r.id}`}
            >
              <Avatar name={r.name} photo={r.photo} size="xs" />
              <Text style={s.mentionName}>@{toHandle(r.name)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={s.inputRow}>
        <TouchableOpacity
          onPress={triggerMentionPicker}
          disabled={isPending || riders.length === 0}
          style={[s.atBtn, (isPending || riders.length === 0) && { opacity: 0.4 }]}
          testID="mention-open"
        >
          <Text style={{ color: "#007AFF", fontWeight: "900", fontSize: 18 }}>@</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          selection={selection}
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
  clubhouseBanner: { marginHorizontal: 10, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  clubhouseText: { color: "#111", fontSize: 12, letterSpacing: 0.2, lineHeight: 17 },
  clubhouseBold: { fontWeight: "800", color: "#0a0d10" },
  clubhouseMuted: { color: "#555", fontStyle: "italic" },
  clubhouseWarn: { color: "#c1272d", fontWeight: "700" },
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
  atBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,122,255,0.08)", alignItems: "center", justifyContent: "center" },
  mentionRow: { backgroundColor: "#fafafa", borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingVertical: 8 },
  mentionEyebrow: { color: "#666", fontSize: 9, letterSpacing: 3, fontWeight: "700", marginRight: 4 },
  mentionChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderColor: "#d0d0d0", borderWidth: 1, borderRadius: 999, paddingLeft: 4, paddingRight: 10, paddingVertical: 3 },
  mentionName: { color: "#111", fontSize: 12, fontWeight: "700" },

  reportOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  reportSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30 },
  reportHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#d0d0d0", marginBottom: 12 },
  reportEyebrow: { color: "#ef4444", fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  reportTitle: { color: "#111", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginTop: 2 },
  reportSnapshot: { backgroundColor: "#f5f5f5", borderRadius: 10, padding: 10, marginTop: 12 },
  reportSnapshotName: { color: "#666", fontSize: 11, fontWeight: "700" },
  reportSnapshotText: { color: "#111", fontSize: 13, marginTop: 4 },
  reportReasonBtn: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e5e5e5", marginTop: 6 },
  reportReasonActive: { borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)" },
  reportReasonTxt: { color: "#111", fontSize: 13 },
  reportOther: { borderWidth: 1, borderColor: "#d0d0d0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, minHeight: 60, textAlignVertical: "top" },
  reportSend: { marginTop: 14, backgroundColor: "#ef4444", borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" },
  reportSendTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  reportCancel: { marginTop: 8, paddingVertical: 12, alignItems: "center" },
  reportCancelTxt: { color: "#666", fontWeight: "700", letterSpacing: 2, fontSize: 12 },
});

function ReportModal({ message, onClose }) {
  const [reason, setReason] = useState(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const finalReason = reason === "Something else" ? other.trim() : reason;
    if (!finalReason) {
      Alert.alert("Report", "Pick a reason (or add details).");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/chat/messages/${message.id}/report`, { reason: finalReason });
      Alert.alert("Thanks", "The GLCC admins will review this shortly.");
      onClose();
    } catch (e) {
      Alert.alert("Report", formatDetail(e));
    } finally { setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.reportOverlay}>
        <View style={s.reportSheet}>
          <View style={s.reportHandle} />
          <Text style={s.reportEyebrow}>REPORT MESSAGE</Text>
          <Text style={s.reportTitle}>What's wrong here?</Text>
          <View style={s.reportSnapshot} testID="report-snapshot">
            <Text style={s.reportSnapshotName}>{message.name}</Text>
            <Text style={s.reportSnapshotText} numberOfLines={4}>{message.text}</Text>
          </View>
          <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setReason(r)}
                style={[s.reportReasonBtn, reason === r && s.reportReasonActive]}
                testID={`report-reason-${r.replace(/\W+/g, "-").toLowerCase()}`}
              >
                <Text style={[s.reportReasonTxt, reason === r && { color: "#ef4444", fontWeight: "700" }]}>{r}</Text>
              </TouchableOpacity>
            ))}
            {reason === "Something else" && (
              <TextInput
                value={other}
                onChangeText={setOther}
                placeholder="Tell us what happened"
                placeholderTextColor="#999"
                multiline
                style={s.reportOther}
                testID="report-other-input"
              />
            )}
          </ScrollView>
          <TouchableOpacity onPress={submit} disabled={busy} style={s.reportSend} testID="report-submit">
            {busy && <ActivityIndicator color="#fff" style={{ marginRight: 6 }} />}
            <Text style={s.reportSendTxt}>SEND REPORT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={s.reportCancel} testID="report-cancel">
            <Text style={s.reportCancelTxt}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
