import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents } from "../lib/store";
import { colors, radius } from "../constants/theme";
import Avatar from "../components/Avatar";

// Full-screen DM modal — the "overlay drawer" reachable from the mail
// icon in the header. Three internal views: inbox / rider-picker / thread.
export default function DMScreen({ visible, onClose }) {
  const [view, setView] = useState("list");
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [peer, setPeer] = useState(null);

  useEffect(() => {
    if (visible) {
      setView("list");
      setPeer(null);
      refresh();
    }
  }, [visible]);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await api.get("/dm/conversations");
      setConvos(data.conversations || []);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  }

  function openThread(p) { setPeer(p); setView("thread"); }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
        <View style={s.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {view !== "list" ? (
              <TouchableOpacity onPress={() => setView("list")} testID="dm-back">
                <Text style={s.headerBtn}>‹ BACK</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={s.headerTitle}>
              {view === "thread" && peer ? (peer.name || "").toUpperCase() : view === "pick" ? "NEW MESSAGE" : "DIRECT MESSAGES"}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} testID="dm-close">
            <Text style={s.headerBtn}>CLOSE</Text>
          </TouchableOpacity>
        </View>
        {view === "list" && (
          <Inbox convos={convos} loading={loading} onPick={openThread} onNew={() => setView("pick")} />
        )}
        {view === "pick" && <PickRider onPick={openThread} />}
        {view === "thread" && peer && <Thread peer={peer} onMutate={refresh} />}
      </SafeAreaView>
    </Modal>
  );
}

function Inbox({ convos, loading, onPick, onNew }) {
  return (
    <FlatList
      data={convos}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={() => (
        <TouchableOpacity style={s.newRow} onPress={onNew} testID="dm-new">
          <View style={s.newIcon}>
            <Text style={{ color: colors.accentPink, fontSize: 20, fontWeight: "900" }}>+</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>New message</Text>
            <Text style={s.rowMeta}>MESSAGE ANY RIDER DIRECTLY</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={() => (loading
        ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.accentPink} />
        : <Text style={s.empty}>NO MESSAGES YET · TAP "NEW MESSAGE"</Text>
      )}
      renderItem={({ item }) => (
        <TouchableOpacity style={s.convoRow} onPress={() => onPick(item.peer)} testID={`dm-convo-${item.id}`}>
          <Avatar name={item.peer.name} photo={item.peer.photo} size="md" />
          <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={s.rowName} numberOfLines={1}>{item.peer.name}</Text>
              <Text style={s.rowTs}>{formatTs(item.last_at)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Text style={[s.rowPreview, item.unread > 0 && { color: colors.textPrimary, fontWeight: "700" }]} numberOfLines={1}>
                {item.last_text || "Say hi…"}
              </Text>
              {item.unread > 0 ? (
                <View style={s.unreadPill} testID={`dm-unread-${item.id}`}>
                  <Text style={s.unreadPillTxt}>{item.unread}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

function PickRider({ onPick }) {
  const { user } = useAuth();
  const [riders, setRiders] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/riders");
        const list = (data.riders || []).filter((r) => r.status === "approved" && String(r.id) !== String(user?.id));
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
    <View style={{ flex: 1 }}>
      <View style={s.searchWrap}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search riders…"
          placeholderTextColor={colors.textMuted}
          style={s.search}
          testID="dm-search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.accentPink} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={() => <Text style={s.empty}>NO RIDERS MATCH</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.convoRow} onPress={() => onPick({ id: item.id, name: item.name, photo: item.photo, role: item.role })} testID={`dm-pick-${item.id}`}>
              <Avatar name={item.name} photo={item.photo} size="md" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.rowMeta}>{(item.role || "MEMBER").toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function Thread({ peer, onMutate }) {
  const { user } = useAuth();
  const { subscribe, wsSend } = useEvents();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    wsSend?.({ type: "dm.focus", peer_id: peer.id });
    return () => wsSend?.({ type: "dm.blur" });
  }, [peer.id, wsSend]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/dm/conversations/${peer.id}`);
        if (cancelled) return;
        setMessages(data.messages || []);
        try { await api.post(`/dm/conversations/${peer.id}/read`); } catch (_) { /* ignore */ }
        onMutate?.();
      } catch (e) {
        Alert.alert("DM", formatDetail(e));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [peer.id]);

  useEffect(() => subscribe((evt) => {
    if (evt.type !== "dm.message") return;
    const msg = evt.message;
    if (!msg) return;
    const involves = (msg.sender_id === peer.id && msg.recipient_id === user?.id)
      || (msg.recipient_id === peer.id && msg.sender_id === user?.id);
    if (!involves) return;
    setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
    if (msg.sender_id === peer.id) {
      api.post(`/dm/conversations/${peer.id}/read`).catch(() => {});
    }
  }), [subscribe, peer.id, user?.id]);

  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 50);
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
    } catch (e) { Alert.alert("DM", formatDetail(e)); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.accentPink} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={() => <Text style={s.empty}>SAY HI 👋</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }} testID={`dm-msg-${item.id}`}>
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                  <Text style={mine ? s.bubbleMineTxt : s.bubbleTheirsTxt}>{item.text}</Text>
                  <Text style={[s.bubbleTs, mine ? { color: "rgba(255,255,255,0.75)" } : { color: colors.textMuted }]}>{formatTs(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={s.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={colors.textMuted}
          style={s.input}
          testID="dm-input"
          maxLength={2000}
          onSubmitEditing={send}
          multiline
        />
        <TouchableOpacity onPress={send} disabled={busy || !text.trim()} style={[s.sendBtn, (busy || !text.trim()) && { opacity: 0.4 }]} testID="dm-send">
          <Text style={s.sendBtnTxt}>SEND</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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

const s = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPrimary,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  headerBtn: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  newRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  newIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(236,72,153,0.15)", borderColor: "rgba(236,72,153,0.35)", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  convoRow: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1 },
  rowMeta: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 2 },
  rowPreview: { color: colors.textMuted, fontSize: 13, flex: 1 },
  rowTs: { color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  unreadPill: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.accentPink, alignItems: "center", justifyContent: "center" },
  unreadPillTxt: { color: "#fff", fontSize: 10, fontWeight: "900" },
  empty: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center", marginTop: 40 },
  searchWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  search: { backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14 },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: colors.accentPink, borderBottomRightRadius: 4 },
  bubbleMineTxt: { color: "#fff", fontSize: 14, lineHeight: 20 },
  bubbleTheirs: { backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleTheirsTxt: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  bubbleTs: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.bgPrimary },
  input: { flex: 1, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.accentPink, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, alignItems: "center" },
  sendBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
});
