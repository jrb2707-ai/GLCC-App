import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Pressable, Animated,
} from "react-native";
import { colors, radius } from "../constants/theme";
import { api } from "../lib/api";
import { useAuth, useTheme, useEvents, useLiveRound } from "../lib/store";
import {
  CogIcon, MailIcon, BellIcon, WrenchIcon, CoffeeIcon, ChatBubbleIcon, TrashIcon,
} from "./Icons";

// GLCC top header — parity with the web app.
// Left: cog → Settings popover (notif toggles, display picker, Exit).
// Right: mail (DMs w/ unread badge), bell (feed popover). A centered
// "GLCC." wordmark sits in the true middle of the bar, colored per the
// active tab — same tokens the bottom tab bar already uses for its active
// icon (see WORDMARK_COLOR below).
const WORDMARK_COLOR = {
  rides: colors.stravaOrange,
  coffee: colors.accentPink,
  riders: colors.statusCant,
  chat: "#007AFF",
};

export default function Header({ onOpenDM, dmUnread, notifPrefs, onPrefsChange, onNavigate, activeTab }) {
  const { user, logout } = useAuth();
  const { subscribe } = useEvents();
  const { open: openLiveRound } = useLiveRound();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [feed, setFeed] = useState({ items: [], unread: 0 });

  // Bell feed hydrates on mount and refreshes on the events that add to it.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (!cancelled) setFeed(data);
      } catch (_) { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 60000);
    const unsub = subscribe((evt) => {
      if (["chat.mechanical", "chat.mechanical.resolved", "coffee.round.started", "chat.mention"].includes(evt.type)) refresh();
    });
    return () => { cancelled = true; clearInterval(id); unsub && unsub(); };
  }, [user, subscribe]);

  async function openBell() {
    const willOpen = !bellOpen;
    setBellOpen(willOpen);
    setSettingsOpen(false);
    if (willOpen) {
      try { await api.post("/notifications/read"); } catch (_) { /* ignore */ }
      setFeed((f) => ({ ...f, unread: 0 }));
    }
  }

  async function clearFeed() {
    try {
      await api.post("/notifications/clear");
      setFeed({ items: [], unread: 0 });
    } catch (_) { /* ignore */ }
  }

  async function onFeedItemTap(item) {
    setBellOpen(false);
    if (item.kind === "coffee") {
      onNavigate?.("Coffee");
      try {
        const { data } = await api.get("/coffee/rounds/active");
        const first = (data.rounds || [])[0];
        if (first) openLiveRound(first);
      } catch (_) { /* ignore */ }
      return;
    }
    if (item.kind === "mechanical" || item.kind === "mention") {
      onNavigate?.("Chat");
      return;
    }
    if (item.kind === "rider") {
      onNavigate?.("Riders");
    }
  }

  const cogTint = settingsOpen ? colors.accentPink : colors.textSecondary;
  const bellTint = (bellOpen || feed.unread > 0) ? colors.accentPink : colors.textSecondary;

  return (
    <View style={s.header}>
      <TouchableOpacity
        onPress={() => { setSettingsOpen((v) => !v); setBellOpen(false); }}
        style={s.iconBtn}
        testID="header-cog"
        accessibilityLabel="Settings"
      >
        <CogIcon color={cogTint} />
      </TouchableOpacity>

      <View style={s.wordmarkWrap} pointerEvents="none">
        <Text
          style={[s.wordmark, { color: WORDMARK_COLOR[(activeTab || "").toLowerCase()] || colors.accentVolt }]}
          testID="header-wordmark"
        >
          GLCC.
        </Text>
      </View>

      <View style={s.rightGroup}>
        <TouchableOpacity onPress={onOpenDM} style={s.iconBtn} testID="dm-open" accessibilityLabel="Messages">
          <MailIcon color={colors.textSecondary} />
          {dmUnread > 0 && (
            <View style={s.badge} testID="dm-badge">
              <Text style={s.badgeTxt}>{dmUnread > 9 ? "9+" : String(dmUnread)}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={openBell} style={s.iconBtn} testID="header-bell" accessibilityLabel="Notifications">
          <BellIcon color={bellTint} />
          {feed.unread > 0 && !bellOpen && <View style={s.bellDot} />}
        </TouchableOpacity>
      </View>

      <SettingsPopover
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        notifPrefs={notifPrefs}
        onPrefsChange={onPrefsChange}
        onLogout={logout}
      />
      <NotificationsPopover
        visible={bellOpen}
        onClose={() => setBellOpen(false)}
        items={feed.items}
        onTap={onFeedItemTap}
        onClear={clearFeed}
      />
    </View>
  );
}

function SettingsPopover({ visible, onClose, notifPrefs, onPrefsChange, onLogout }) {
  const { theme, setTheme } = useTheme();

  const toggle = async (key) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    onPrefsChange(next);
    try {
      const { data } = await api.put("/users/me/notification-prefs", { [key]: next[key] });
      onPrefsChange(data.notification_prefs || next);
    } catch (_) {
      onPrefsChange(notifPrefs);
    }
  };

  const rows = [
    { key: "mechanical", label: "Mechanical alerts", sub: "Recommended", Icon: WrenchIcon },
    { key: "coffee", label: "Coffee rounds", Icon: CoffeeIcon },
    { key: "chat", label: "Club chat", Icon: ChatBubbleIcon },
    { key: "dm", label: "Private messages", Icon: MailIcon },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlayBg} onPress={onClose}>
        <View style={s.popoverLeft} testID="settings-popover">
          <Pressable onPress={() => {}}>
            <Text style={s.popoverEyebrow}>Settings</Text>
            <View style={s.popoverList}>
              {rows.map((r, i) => {
                const on = !!notifPrefs?.[r.key];
                return (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => toggle(r.key)}
                    style={[s.prefRow, i > 0 && s.rowDivider]}
                    testID={`pref-${r.key}`}
                  >
                    <r.Icon color={colors.textMuted} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.prefLabel}>{r.label}</Text>
                      {r.sub ? <Text style={s.prefSub}>{r.sub}</Text> : null}
                    </View>
                    <Toggle on={on} />
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={s.popoverEyebrowMuted}>Display</Text>
            <View style={s.themeRow}>
              {["auto", "dark", "light"].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setTheme(opt)}
                  style={[s.themePill, theme === opt && s.themePillActive]}
                  testID={`theme-${opt}`}
                >
                  <Text style={[s.themePillTxt, theme === opt && s.themePillTxtActive]}>
                    {opt[0].toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={onLogout} style={s.exitRow} testID="header-exit">
              <Text style={s.exit}>Exit ↗</Text>
            </TouchableOpacity>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function NotificationsPopover({ visible, onClose, items, onTap, onClear }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlayBg} onPress={onClose}>
        <View style={s.popoverRight} testID="notifications-popover">
          <Pressable onPress={() => {}}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, marginBottom: 6 }}>
              <Text style={s.popoverEyebrow}>Notifications</Text>
              {items.length > 0 && (
                <TouchableOpacity onPress={onClear} testID="notif-clear" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <TrashIcon color={colors.textMuted} size={11} />
                  <Text style={s.clearBtn}>CLEAR</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {items.length === 0 ? (
                <Text style={s.emptyFeed}>ALL QUIET</Text>
              ) : items.map((it) => {
                const style = feedIconStyle(it.kind);
                const IconComp = feedIconComp(it.kind);
                return (
                  <TouchableOpacity
                    key={it.id}
                    onPress={() => onTap && onTap(it)}
                    style={s.feedRow}
                    testID={`notif-item-${it.kind}`}
                  >
                    <View style={[s.feedIconBox, { backgroundColor: style.bg }]}>
                      <IconComp color={style.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={s.feedText}>
                        <Text style={{ fontWeight: "700" }}>{it.title} </Text>{it.subtitle}
                      </Text>
                      <Text style={s.feedTime}>{fmtRel(it.created_at)}</Text>
                    </View>
                    {it.unread ? <View style={s.feedDot} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// First-time "Stay in the loop" prompt — shown once after login while
// has_seen_notification_prompt is false. All rows default to ON.
export function NotificationPrompt({ visible, onDone }) {
  const [prefs, setPrefs] = useState({ mechanical: true, coffee: true, chat: true, dm: true });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.put("/users/me/notification-prefs", { ...prefs, has_seen_notification_prompt: true });
      onDone?.(prefs);
    } catch (_) { /* ignore */ }
    finally { setBusy(false); }
  };

  const rows = [
    { key: "mechanical", label: "Mechanical alerts", sub: "Recommended — always on", Icon: WrenchIcon },
    { key: "coffee", label: "Coffee rounds", Icon: CoffeeIcon },
    { key: "chat", label: "Club chat", Icon: ChatBubbleIcon },
    { key: "dm", label: "Private messages", Icon: MailIcon },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.promptBg} testID="notif-prompt">
        <View style={s.promptCard}>
          <View style={s.promptBellCircle}><BellIcon color={colors.accentPink} size={24} /></View>
          <Text style={s.promptTitle}>Stay in the loop</Text>
          <Text style={s.promptSub}>Choose what the club can notify you about. You can change this anytime from the cog icon.</Text>
          <View style={s.popoverList}>
            {rows.map((r, i) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => setPrefs((p) => ({ ...p, [r.key]: !p[r.key] }))}
                style={[s.prefRow, i > 0 && s.rowDivider]}
                testID={`prompt-${r.key}`}
              >
                <r.Icon color={colors.textMuted} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.prefLabel}>{r.label}</Text>
                  {r.sub ? <Text style={s.prefSub}>{r.sub}</Text> : null}
                </View>
                <Toggle on={prefs[r.key]} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[s.saveBtn, busy && { opacity: 0.6 }]}
            onPress={save}
            disabled={busy}
            testID="prompt-save"
          >
            <Text style={s.saveBtnTxt}>{busy ? "Saving…" : "Save preferences"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Toggle({ on }) {
  return (
    <View style={[s.toggle, on && s.toggleOn]}>
      <View style={[s.toggleThumb, { left: on ? 20 : 2 }]} />
    </View>
  );
}

function feedIconStyle(kind) {
  if (kind === "mechanical") return { bg: "rgba(239,68,68,0.15)", color: colors.statusCant };
  if (kind === "coffee") return { bg: "rgba(255,45,149,0.15)", color: colors.accentPink };
  return { bg: "rgba(0,122,255,0.15)", color: "#007AFF" };
}
function feedIconComp(kind) {
  if (kind === "mechanical") return WrenchIcon;
  if (kind === "coffee") return CoffeeIcon;
  return ChatBubbleIcon;
}
function fmtRel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPrimary,
  },
  iconBtn: { padding: 6, position: "relative" },
  rightGroup: { flexDirection: "row", alignItems: "center", gap: 12 },
  // Absolutely centered against the whole bar (not the flex space-between
  // midpoint), same technique as web, so it's centered regardless of how
  // wide the left/right icon groups are.
  wordmarkWrap: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  wordmark: { fontSize: 17, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  exitRow: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle, alignItems: "center" },
  exit: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  badge: {
    position: "absolute", top: -1, right: -3, minWidth: 15, height: 15, paddingHorizontal: 3,
    borderRadius: 8, backgroundColor: colors.accentPink, alignItems: "center", justifyContent: "center",
  },
  badgeTxt: { color: "#fff", fontSize: 9, fontWeight: "900" },
  bellDot: { position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentPink },

  overlayBg: { flex: 1, backgroundColor: "transparent" },
  popoverLeft: {
    position: "absolute", top: 56, left: 8, width: 260,
    backgroundColor: colors.bgSecondary, borderColor: colors.accentPink, borderWidth: 1,
    borderRadius: 18, padding: 14, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  popoverRight: {
    position: "absolute", top: 56, right: 8, width: 280,
    backgroundColor: colors.bgSecondary, borderColor: colors.accentPink, borderWidth: 1,
    borderRadius: 18, padding: 10, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  popoverEyebrow: { color: colors.accentPink, fontSize: 10, letterSpacing: 2, fontWeight: "900", marginBottom: 8 },
  popoverEyebrowMuted: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "900", marginTop: 12, marginBottom: 6 },
  popoverList: { backgroundColor: colors.bgPrimary, borderRadius: 12, borderColor: colors.borderSubtle, borderWidth: 1, overflow: "hidden" },
  prefRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  prefLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  prefSub: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontWeight: "700", marginTop: 2 },

  toggle: { width: 36, height: 20, borderRadius: 999, backgroundColor: colors.bgSecondary, borderColor: colors.borderSubtle, borderWidth: 1, position: "relative", justifyContent: "center" },
  toggleOn: { backgroundColor: colors.accentPink, borderColor: colors.accentPink },
  toggleThumb: { position: "absolute", top: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff" },

  themeRow: { flexDirection: "row", backgroundColor: colors.bgPrimary, borderRadius: 12, padding: 3, gap: 4, marginTop: 4 },
  themePill: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center" },
  themePillActive: { backgroundColor: colors.accentPink },
  themePillTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  themePillTxtActive: { color: "#fff", fontWeight: "900" },

  emptyFeed: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center", paddingVertical: 20 },
  clearBtn: { color: colors.textMuted, fontSize: 9, letterSpacing: 2, fontWeight: "900" },
  feedRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  feedIconBox: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  feedText: { color: colors.textPrimary, fontSize: 12.5, lineHeight: 16 },
  feedTime: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  feedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentPink, marginTop: 10, marginLeft: 4 },

  promptBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 16 },
  promptCard: { width: "100%", maxWidth: 380, backgroundColor: colors.bgSecondary, borderColor: colors.accentPink, borderWidth: 1, borderRadius: 24, padding: 24 },
  promptBellCircle: { width: 56, height: 56, borderRadius: 28, alignSelf: "center", backgroundColor: "rgba(255,45,149,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  promptTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "900", textAlign: "center", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 },
  promptSub: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 280, alignSelf: "center", marginBottom: 16 },
  saveBtn: { backgroundColor: colors.accentPink, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  saveBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
});
