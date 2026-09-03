import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { useAuth, useEvents, useTheme } from "../lib/store";
import { colors, radius, spacing, COFFEES } from "../constants/theme";
import Avatar from "../components/Avatar";
import MemberCard from "../components/MemberCard";
import CafeRulesAdmin from "../components/CafeRulesAdmin";
import { pad4 } from "../lib/util";
import { pickAvatar } from "../lib/imagePicker";
import { readCache, writeCache } from "../lib/cache";

// Coffee jersey chip — mirrors the web JerseyBadge. Solid tier colour, small
// pill, always uppercased. Red = 25 rounds bought, Pink = 50, Yellow = 100.
const JERSEY_MAP = {
  red:    { bg: "#EF4444", label: "RUBY ROASTER" },
  pink:   { bg: "#EC4899", label: "PINK PELOTON" },
  yellow: { bg: "#FBBF24", label: "YELLOW JERSEY" },
};
function JerseyPill({ tier }) {
  const j = JERSEY_MAP[tier];
  if (!j) return null;
  return (
    <View
      style={{ backgroundColor: j.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}
      testID={`jersey-${tier}`}
    >
      <Text style={{ color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 }}>
        {j.label}
      </Text>
    </View>
  );
}

export default function RidersTab() {
  const { user, refreshMe, logout } = useAuth();
  const { subscribe } = useEvents();
  const [riders, setRiders] = useState([]);
  const [pending, setPending] = useState([]);
  const [blockedIds, setBlockedIds] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openRider, setOpenRider] = useState(null); // { rider, mode: 'card'|'edit' }
  const [inviteOpen, setInviteOpen] = useState(false);
  const [processingReport, setProcessingReport] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, b, rep] = await Promise.all([
        api.get("/riders"),
        api.get("/blocks").catch(() => ({ data: { blocked_ids: [] } })),
        user?.is_admin
          ? api.get("/admin/reports?status_filter=open").catch(() => ({ data: { reports: [] } }))
          : Promise.resolve({ data: { reports: [] } }),
      ]);
      setRiders(r.data.riders || []);
      setPending(r.data.pending || []);
      setBlockedIds(b.data.blocked_ids || []);
      setReports(rep.data.reports || []);
      writeCache("riders", r.data.riders || []);
      writeCache("pending", r.data.pending || []);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.is_admin]);
  useEffect(() => {
    (async () => {
      const [cachedR, cachedP] = await Promise.all([readCache("riders"), readCache("pending")]);
      if (cachedR) setRiders(cachedR);
      if (cachedP) setPending(cachedP);
      if (cachedR || cachedP) setLoading(false);
    })();
    load();
  }, [load]);

  // Live roster updates
  useEffect(() => {
    return subscribe((evt) => {
      if (["rider.updated", "rider.pending", "rider.deleted", "rider.approved", "rider.denied", "chat.report", "chat.deleted"].includes(evt.type)) {
        load();
      }
    });
  }, [subscribe, load]);

  async function actOnReport(id, action) {
    if (processingReport) return;
    setProcessingReport(id);
    try {
      const path = action === "delete" ? `/admin/reports/${id}/delete-message` : `/admin/reports/${id}/dismiss`;
      await api.post(path);
      await load();
    } catch (e) { Alert.alert("Report", formatDetail(e)); }
    finally { setProcessingReport(null); }
  }

  async function decidePending(id, action) {
    try {
      await api.post("/riders/action", { action, target_id: id });
      load();
    } catch (e) { Alert.alert("Rider", formatDetail(e)); }
  }

  function onOpenRider(r) {
    // Self opens editor; others open member card
    if (r.id === user?.id) setOpenRider({ rider: r, mode: "edit" });
    else setOpenRider({ rider: r, mode: "card" });
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accentVolt} /></View>;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accentVolt} />}
    >
      <View style={s.headerRow}>
        <Text style={s.h1}>Riders</Text>
        <Text style={s.sub}>{riders.length} MEMBERS</Text>
      </View>

      {user?.is_admin && (
        <TouchableOpacity onPress={() => setInviteOpen(true)} style={s.inviteBtn} testID="register-rider-button">
          <Text style={s.inviteTxt}>＋ INVITE A RIDER</Text>
        </TouchableOpacity>
      )}

      {user?.is_admin && <CafeRulesAdmin />}

      {user?.is_admin && reports.length > 0 && (
        <View style={s.reportsBlock} testID="reports-block">
          <TouchableOpacity
            onPress={() => setReportsOpen((v) => !v)}
            style={s.reportsHeader}
            testID="reports-toggle"
          >
            <Text style={s.reportsEyebrow}>🚩 REPORTED MESSAGES · {reports.length}</Text>
            <Text style={s.reportsChevron}>{reportsOpen ? "−" : "+"}</Text>
          </TouchableOpacity>
          {reportsOpen && reports.map((r) => (
            <View key={r.id} style={s.reportItem} testID={`report-item-${r.id}`}>
              <Text style={s.reportSnapshotName}>
                {r.message_snapshot?.name || "Unknown"} · {r.reason}
              </Text>
              <Text style={s.reportSnapshotText} numberOfLines={4}>
                {r.message_snapshot?.text || "(message deleted)"}
              </Text>
              <Text style={s.reportMeta}>Reported by {r.reporter_name}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => actOnReport(r.id, "dismiss")}
                  disabled={processingReport === r.id}
                  style={s.reportDismiss}
                  testID={`report-dismiss-${r.id}`}
                >
                  <Text style={s.reportDismissTxt}>DISMISS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => actOnReport(r.id, "delete")}
                  disabled={processingReport === r.id}
                  style={s.reportDelete}
                  testID={`report-delete-${r.id}`}
                >
                  {processingReport === r.id && <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />}
                  <Text style={s.reportDeleteTxt}>DELETE MESSAGE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {user?.is_admin && pending.length > 0 && (
        <View style={s.pendingBlock} testID="pending-block">
          <Text style={s.pendingEyebrow}>PENDING APPROVAL · {pending.length}</Text>
          {pending.map((p) => (
            <View key={p.id} style={s.pendingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.pendingName}>{p.name}</Text>
                <Text style={s.pendingCoffee}>{p.coffee}</Text>
              </View>
              <TouchableOpacity onPress={() => decidePending(p.id, "approve")} style={s.approveBtn} testID={`approve-${p.id}`}>
                <Text style={{ color: colors.statusGoing, fontWeight: "900" }}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => decidePending(p.id, "deny")} style={s.denyBtn} testID={`deny-${p.id}`}>
                <Text style={{ color: colors.statusCant, fontWeight: "900" }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {riders.map((r) => (
        <TouchableOpacity key={r.id} onPress={() => onOpenRider(r)} style={s.card} testID={`rider-card-${r.id}`}>
          <Avatar name={r.name} photo={r.photo} size="md" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={s.name}>{r.name}</Text>
              {r.top_jersey_tier && <JerseyPill tier={r.top_jersey_tier} />}
              {r.is_admin && (
                <View style={r.is_president ? s.badgePrez : s.badge}>
                  <Text style={r.is_president ? s.badgePrezTxt : s.badgeTxt}>
                    {r.is_president ? "EL PREZ" : "ADMIN"}
                  </Text>
                </View>
              )}
              {r.status === "invited" && (
                <View style={s.invitedBadge} testID={`invited-badge-${r.id}`}><Text style={s.invitedTxt}>INVITED</Text></View>
              )}
            </View>
            <Text style={s.meta}>{r.role} · {r.coffee}</Text>
          </View>
          {r.member_no != null && <Text style={s.memberNo}>#{pad4(r.member_no)}</Text>}
        </TouchableOpacity>
      ))}

      {/* Member card viewer (others) */}
      {openRider?.mode === "card" && (
        <MemberCard
          rider={openRider.rider}
          onClose={() => setOpenRider(null)}
          onEditProfile={user?.is_admin ? () => setOpenRider({ rider: openRider.rider, mode: "edit" }) : undefined}
          canBlock={!openRider.rider.is_president && openRider.rider.id !== user?.id}
          isBlocked={blockedIds.includes(openRider.rider.id)}
          onBlockChange={load}
        />
      )}

      {/* Editor modal (self OR admin editing others) */}
      {openRider?.mode === "edit" && (
        <ProfileModal
          rider={openRider.rider}
          isBlocked={blockedIds.includes(openRider.rider.id)}
          onLogout={logout}
          onClose={() => setOpenRider(null)}
          onSaved={async () => { await load(); await refreshMe(); }}
        />
      )}

      {inviteOpen && (
        <InviteModal onClose={() => { setInviteOpen(false); load(); }} />
      )}
    </ScrollView>
  );
}

// -------------------- Profile Modal --------------------
function ProfileModal({ rider, onClose, onSaved, onLogout, isBlocked }) {
  const { user } = useAuth();
  const { theme, cycleTheme } = useTheme();
  const [name, setName] = useState(rider.name || "");
  const [role, setRole] = useState(rider.role || "Member");
  const [bio, setBio] = useState(rider.bio || "");
  const [coffee, setCoffee] = useState(rider.coffee || "Medium Flat White");
  const [photo, setPhoto] = useState(rider.photo || null);
  const [reminders, setReminders] = useState(rider.ride_reminders !== false);
  const [uploading, setUploading] = useState(false);
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [deletePwd, setDeletePwd] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const isMe = rider.id === user?.id;
  const selfPending = isMe && user?.status === "pending";
  const canEdit = (user?.is_admin || isMe) && !selfPending;
  const canEditPhoto = user?.is_admin && !isMe; // matches web parity
  const isPresident = user?.is_president;

  async function toggleBlock() {
    try {
      if (isBlocked) {
        await api.delete(`/blocks/${rider.id}`);
      } else {
        Alert.alert(
          "Block this rider?",
          "You won't see their chat messages and they can't @mention you. You can unblock any time.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Block", style: "destructive",
              onPress: async () => {
                try {
                  await api.post("/blocks", { target_id: rider.id });
                  await onSaved?.();
                  onClose();
                } catch (e) { Alert.alert("Block", formatDetail(e)); }
              },
            },
          ]
        );
        return;
      }
      await onSaved?.();
    } catch (e) { Alert.alert("Block", formatDetail(e)); }
  }

  async function deleteAccount() {
    if (deletingAccount) return;
    if (!deletePwd) return Alert.alert("Delete", "Enter your password to confirm.");
    setDeletingAccount(true);
    try {
      await api.delete("/auth/me", { data: { password: deletePwd } });
      Alert.alert("Account deleted", "Your rider account has been removed.");
      onLogout?.();
    } catch (e) {
      Alert.alert("Delete", formatDetail(e));
    } finally { setDeletingAccount(false); }
  }

  async function onPickPhoto() {
    if (uploading) return;
    setUploading(true);
    try {
      const res = await pickAvatar();
      if (res.permissionDenied) {
        Alert.alert("Photos", "Enable photo library access in Settings to change avatars.");
        return;
      }
      if (res.canceled || !res.dataUrl) return;
      setPhoto(res.dataUrl);
    } catch (e) {
      Alert.alert("Photo", "Couldn't read that image");
    } finally { setUploading(false); }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const url = isMe ? "/riders/me" : `/riders/${rider.id}`;
      const body = isMe
        ? { name, coffee, ride_reminders: reminders }
        : { name, role, bio, photo };
      await api.patch(url, body);
      await onSaved?.();
      Alert.alert("Profile", "Saved");
      onClose();
    } catch (e) {
      Alert.alert("Profile", formatDetail(e));
    } finally { setSaving(false); }
  }

  async function sendTestPush() {
    if (testingPush) return;
    setTestingPush(true);
    try {
      const { data } = await api.post("/push/test");
      if (data?.ok) Alert.alert("Test push sent", `Delivered to ${data.sent} device${data.sent === 1 ? "" : "s"}. Should land within a few seconds.`);
      else Alert.alert("No devices", data?.detail || "This account hasn't registered a push token yet.");
    } catch (e) {
      Alert.alert("Push", formatDetail(e));
    } finally { setTestingPush(false); }
  }

  async function act(action) {
    try {
      await api.post("/riders/action", { action, target_id: rider.id });
      await onSaved?.();
      onClose();
    } catch (e) {
      Alert.alert("Admin", formatDetail(e));
    }
  }

  function confirmDeleteRider() {
    Alert.alert(
      "Delete rider?",
      `Are you sure you want to delete ${rider.name}? Their profile is removed from the roster. Chat messages they sent stay in the history but appear as "Former rider". This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, delete",
          style: "destructive",
          onPress: () => act("delete"),
        },
      ],
    );
  }

  async function sendReset() {
    try {
      const { data } = await api.post("/riders/reset-password", { target_id: rider.id });
      if (data.email_sent) Alert.alert("Reset link sent", `Emailed to ${data.sent_to}`);
      else Alert.alert("Email service unavailable", "Check Resend configuration");
    } catch (e) { Alert.alert("Reset", formatDetail(e)); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View>
                <Avatar name={rider.name} photo={photo} size="lg" />
                {canEditPhoto && (
                  <TouchableOpacity
                    onPress={onPickPhoto}
                    style={s.photoBtn}
                    testID="profile-photo-button"
                  >
                    <Text style={{ color: "#000", fontWeight: "900", fontSize: 14 }}>📷</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pName}>{rider.name}</Text>
                <View style={{ flexDirection: "row", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  <Text style={s.pRole}>{rider.role}</Text>
                  {rider.top_jersey_tier && <JerseyPill tier={rider.top_jersey_tier} />}
                  {rider.is_admin && (
                    <View style={rider.is_president ? s.badgePrez : s.badge}>
                      <Text style={rider.is_president ? s.badgePrezTxt : s.badgeTxt}>
                        {rider.is_president ? "EL PREZ" : "ADMIN"}
                      </Text>
                    </View>
                  )}
                  {rider.status === "invited" && (
                    <View style={s.invitedBadge}><Text style={s.invitedTxt}>INVITED</Text></View>
                  )}
                </View>
                {uploading && <Text style={s.uploadingTxt}>RESIZING…</Text>}
              </View>
            </View>

            {!canEdit ? (
              <Text style={s.bioView}>{rider.bio || "No bio yet."}</Text>
            ) : (
              <View style={{ marginTop: 16, gap: 10 }}>
                <TextInput value={name} onChangeText={setName} placeholder="Rider name" placeholderTextColor={colors.textMuted} style={s.pInput} testID="profile-name" />
                {user?.is_admin && !isMe && (
                  <>
                    <TextInput value={role} onChangeText={setRole} placeholder="Role" placeholderTextColor={colors.textMuted} style={s.pInput} testID="profile-role" />
                    <TextInput value={bio} onChangeText={setBio} placeholder="Bio" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} style={[s.pInput, { minHeight: 80, textAlignVertical: "top" }]} testID="profile-bio" />
                  </>
                )}
                {isMe && (
                  <>
                    <Text style={s.miniLabel}>COFFEE</Text>
                    <TouchableOpacity style={s.pInput} onPress={() => setCoffeeOpen(true)}>
                      <Text style={{ color: colors.textPrimary }}>{coffee}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {isMe && rider.member_no != null && (
                  <View style={s.sinceBox} testID="profile-since">
                    <View>
                      <Text style={s.miniLabel}>MEMBER SINCE</Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                        {rider.created_at ? new Date(rider.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={s.miniLabel}>MEMBER NO.</Text>
                      <Text style={{ color: colors.textPrimary, fontWeight: "900", fontSize: 14 }}>#{pad4(rider.member_no)}</Text>
                    </View>
                  </View>
                )}
                {isMe && (
                  <TouchableOpacity
                    onPress={() => setReminders((v) => !v)}
                    style={s.toggleRow}
                    testID="reminder-toggle"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.miniLabel}>RIDE REMINDER EMAILS</Text>
                      <Text style={s.toggleHint}>Evening-before email for rides you're going to</Text>
                    </View>
                    <View style={[s.toggleTrack, reminders && s.toggleTrackOn]}>
                      <View style={[s.toggleThumb, reminders && s.toggleThumbOn]} />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              {canEdit && (
                <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn} testID="profile-save">
                  {saving && <ActivityIndicator color="#000" style={{ marginRight: 6 }} />}
                  <Text style={s.saveTxt}>SAVE</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="profile-close">
                <Text style={s.closeTxt}>CLOSE</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setCardOpen(true)} style={s.cardCta} testID="view-member-card">
              <Text style={s.cardCtaTxt}>
                🪪 VIEW MEMBER CARD {rider.member_no != null && <Text style={{ color: "rgba(255,255,255,0.6)" }}>#{pad4(rider.member_no)}</Text>}
              </Text>
            </TouchableOpacity>

            {isMe && (
              <TouchableOpacity
                onPress={sendTestPush}
                disabled={testingPush}
                style={s.pushBtn}
                testID="send-test-push"
              >
                {testingPush && <ActivityIndicator size="small" color={colors.accentVolt} style={{ marginRight: 6 }} />}
                <Text style={s.pushBtnTxt}>🔔 SEND A TEST PUSH</Text>
              </TouchableOpacity>
            )}

            {isMe && user?.is_admin && (
              <TouchableOpacity
                onPress={cycleTheme}
                style={s.themeBtn}
                testID="theme-toggle"
              >
                <Text style={s.themeBtnTxt}>
                  {theme === "light" ? "☀️ THEME: LIGHT" : theme === "dark" ? "🌙 THEME: DARK" : "🖥️ THEME: AUTO"}
                </Text>
                <Text style={s.themeBtnHint}>TAP TO CYCLE · FULL LIGHT MODE ROLLING OUT</Text>
              </TouchableOpacity>
            )}

            {!isMe && !rider.is_president && (
              <TouchableOpacity
                onPress={toggleBlock}
                style={[s.blockBtn, isBlocked && s.blockBtnActive]}
                testID={isBlocked ? "unblock-rider" : "block-rider"}
              >
                <Text style={[s.blockBtnTxt, isBlocked && { color: "#fff" }]}>
                  {isBlocked ? "✓ BLOCKED · TAP TO UNBLOCK" : "🚫 BLOCK THIS RIDER"}
                </Text>
              </TouchableOpacity>
            )}

            {isMe && user?.status === "approved" && (
              <View style={{ marginTop: 12 }}>
                <ChangePasswordBlock />
              </View>
            )}

            {isMe && !isPresident && (
              <View style={{ marginTop: 12 }}>
                {!deleteOpen ? (
                  <TouchableOpacity
                    onPress={() => setDeleteOpen(true)}
                    style={s.deleteBtn}
                    testID="delete-account-open"
                  >
                    <Text style={s.deleteBtnTxt}>DELETE MY ACCOUNT</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.deleteBlock} testID="delete-account-block">
                    <Text style={s.miniLabel}>DELETE ACCOUNT</Text>
                    <Text style={s.deleteHint}>
                      Your rider profile is removed. Chat messages you sent stay in the history but appear as "Former rider".
                    </Text>
                    <TextInput
                      secureTextEntry
                      value={deletePwd}
                      onChangeText={setDeletePwd}
                      placeholder="Password"
                      placeholderTextColor={colors.textMuted}
                      style={s.pInputSm}
                      testID="delete-account-password"
                    />
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                      <TouchableOpacity
                        onPress={() => { setDeleteOpen(false); setDeletePwd(""); }}
                        style={s.pwdCancel}
                        testID="delete-account-cancel"
                      >
                        <Text style={s.closeTxt}>CANCEL</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={deleteAccount}
                        disabled={deletingAccount || !deletePwd}
                        style={[s.deleteConfirm, (!deletePwd || deletingAccount) && { opacity: 0.5 }]}
                        testID="delete-account-confirm"
                      >
                        {deletingAccount && <ActivityIndicator color="#fff" style={{ marginRight: 6 }} />}
                        <Text style={s.deleteConfirmTxt}>DELETE FOREVER</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {user?.is_admin && !isMe && (
              <View style={s.adminBlock}>
                <Text style={s.adminEyebrow}>ADMIN ACTIONS</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {isPresident && !rider.is_admin && (
                    <TouchableOpacity onPress={() => act("make_admin")} style={s.adminBtnVolt} testID="admin-make">
                      <Text style={s.adminBtnVoltTxt}>MAKE ADMIN</Text>
                    </TouchableOpacity>
                  )}
                  {isPresident && rider.is_admin && !rider.is_president && (
                    <TouchableOpacity onPress={() => act("remove_admin")} style={s.adminBtnGhost} testID="admin-remove">
                      <Text style={s.adminBtnGhostTxt}>REMOVE ADMIN</Text>
                    </TouchableOpacity>
                  )}
                  {rider.email && rider.status !== "invited" && (
                    <TouchableOpacity onPress={sendReset} style={s.adminBtnGhost} testID="admin-reset-password">
                      <Text style={s.adminBtnGhostTxt}>SEND RESET LINK</Text>
                    </TouchableOpacity>
                  )}
                  {!rider.is_president && (
                    <TouchableOpacity onPress={confirmDeleteRider} style={s.adminBtnDanger} testID="admin-delete">
                      <Text style={s.adminBtnDangerTxt}>DELETE</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!isPresident && <Text style={s.adminHint}>Make / remove admin is President-only.</Text>}
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {coffeeOpen && (
        <CoffeePicker value={coffee} onChange={setCoffee} onClose={() => setCoffeeOpen(false)} />
      )}
      {cardOpen && (
        <MemberCard rider={{ ...rider, name, coffee, role, photo }} onClose={() => setCardOpen(false)} />
      )}
    </Modal>
  );
}

// -------------------- Change Password inline --------------------
function ChangePasswordBlock() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (next.length < 8) return Alert.alert("Password", "Must be at least 8 characters");
    if (next !== confirm) return Alert.alert("Password", "Passwords don't match");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      Alert.alert("Password", "Updated");
      setCurrent(""); setNext(""); setConfirm(""); setOpen(false);
    } catch (e) { Alert.alert("Password", formatDetail(e)); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)} style={s.pwdOpen} testID="change-password-open">
        <Text style={s.pwdOpenTxt}>🔑 CHANGE PASSWORD</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={s.pwdBlock} testID="change-password-block">
      <Text style={s.miniLabel}>CHANGE PASSWORD</Text>
      <TextInput secureTextEntry placeholder="Current password" placeholderTextColor={colors.textMuted} value={current} onChangeText={setCurrent} style={s.pInputSm} testID="change-current-password" />
      <TextInput secureTextEntry placeholder="New password (min 8)" placeholderTextColor={colors.textMuted} value={next} onChangeText={setNext} style={s.pInputSm} testID="change-new-password" />
      <TextInput secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.textMuted} value={confirm} onChangeText={setConfirm} style={s.pInputSm} testID="change-confirm-password" />
      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
        <TouchableOpacity onPress={() => { setOpen(false); setCurrent(""); setNext(""); setConfirm(""); }} style={s.pwdCancel} testID="change-password-cancel">
          <Text style={s.closeTxt}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} disabled={busy || !current || !next} style={s.saveBtn} testID="change-password-submit">
          <Text style={s.saveTxt}>{busy ? "…" : "UPDATE"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// -------------------- Coffee picker (reused) --------------------
function CoffeePicker({ value, onChange, onClose }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.pName}>Coffee order</Text>
          <ScrollView style={{ maxHeight: 380, marginTop: 8 }}>
            {COFFEES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => { onChange(c); onClose(); }}
                style={[s.coffeeItem, value === c && s.coffeeItemActive]}
              >
                <Text style={{ color: value === c ? colors.accentVolt : colors.textPrimary }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: colors.textSecondary }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// -------------------- Invite Modal --------------------
function InviteModal({ onClose }) {
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("Medium Flat White");
  const [role, setRole] = useState("Member");
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.post("/riders/invite", { name: name.trim(), coffee, role });
      Alert.alert("Rider invited", `${name.trim()} added to the roster`);
      onClose();
    } catch (e) { Alert.alert("Invite", formatDetail(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.eyebrowInvite}>INVITE A RIDER</Text>
          <Text style={s.pName}>New rider</Text>
          <Text style={s.inviteHint}>They'll appear as Invited until they sign up with their own email.</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.textMuted} style={s.pInput} testID="register-name" />
            <TextInput value={role} onChangeText={setRole} placeholder="Role" placeholderTextColor={colors.textMuted} style={s.pInput} testID="register-role" />
            <TouchableOpacity onPress={() => setCoffeeOpen(true)} style={s.pInput} testID="register-coffee">
              <Text style={{ color: colors.textPrimary }}>{coffee}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="register-cancel">
              <Text style={s.closeTxt}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || busy} style={[s.saveBtn, (!name.trim() || busy) && { opacity: 0.5 }]} testID="register-submit">
              <Text style={s.saveTxt}>{busy ? "INVITING…" : "ADD TO ROSTER"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {coffeeOpen && (
        <CoffeePicker value={coffee} onChange={setCoffee} onClose={() => setCoffeeOpen(false)} />
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  h1: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, textTransform: "uppercase" },
  sub: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700" },

  inviteBtn: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSecondary, borderColor: "rgba(212,255,0,0.40)", borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginBottom: 12 },
  inviteTxt: { color: colors.textPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },

  pendingBlock: { backgroundColor: "rgba(251,191,36,0.10)", borderColor: "rgba(251,191,36,0.30)", borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 12 },
  pendingEyebrow: { color: colors.statusMaybe, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 8 },
  pendingRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgPrimary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  pendingName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  pendingCoffee: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  approveBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: "rgba(34,197,94,0.20)", alignItems: "center", justifyContent: "center", marginRight: 4 },
  denyBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: "rgba(239,68,68,0.20)", alignItems: "center", justifyContent: "center" },

  card: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: 8 },
  name: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  meta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  memberNo: { color: colors.textMuted, fontSize: 10, letterSpacing: 1 },
  badge: { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.40)", borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeTxt: { color: colors.statusCant, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  // El Prez badge — pink to distinguish the head honcho from the regular admin roll-call.
  badgePrez: { backgroundColor: "rgba(255,45,149,0.15)", borderColor: "rgba(255,45,149,0.40)", borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgePrezTxt: { color: colors.accentPink, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  invitedBadge: { backgroundColor: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.30)", borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  invitedTxt: { color: colors.statusMaybe, fontSize: 9, letterSpacing: 2, fontWeight: "700" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, marginBottom: 12 },
  pName: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, textTransform: "uppercase" },
  pRole: { color: colors.textSecondary, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  bioView: { color: colors.textSecondary, marginTop: 16, fontSize: 14 },

  pInput: { backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 14 },
  pInputSm: { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 13, marginTop: 6 },
  miniLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700", marginTop: 4 },
  sinceBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, padding: 12 },

  saveBtn: { flex: 1, backgroundColor: colors.accentVolt, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  saveTxt: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  closeBtn: { flex: 1, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  closeTxt: { color: colors.textSecondary, letterSpacing: 2, fontWeight: "700", fontSize: 12 },

  cardCta: { marginTop: 10, backgroundColor: "#000", borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  cardCtaTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 12 },

  pwdOpen: { borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  pwdOpenTxt: { color: colors.textSecondary, fontWeight: "700", letterSpacing: 2, fontSize: 12 },
  pwdBlock: { borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, padding: 12, backgroundColor: colors.bgPrimary },
  pwdCancel: { flex: 1, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center" },

  adminBlock: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  adminEyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 3, fontWeight: "700", marginBottom: 8 },
  adminBtnVolt: { backgroundColor: "rgba(212,255,0,0.15)", borderColor: "rgba(212,255,0,0.40)", borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm },
  adminBtnVoltTxt: { color: colors.accentVolt, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  adminBtnGhost: { backgroundColor: colors.bgPrimary, borderColor: colors.borderSubtle, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm },
  adminBtnGhostTxt: { color: colors.textSecondary, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  adminBtnDanger: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.40)", borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm },
  adminBtnDangerTxt: { color: colors.statusCant, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  adminHint: { color: colors.textMuted, fontSize: 10, marginTop: 8 },

  coffeeItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md },
  coffeeItemActive: { backgroundColor: "rgba(212,255,0,0.10)", borderWidth: 1, borderColor: colors.accentVolt },

  eyebrowInvite: { color: colors.textPrimary, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  inviteHint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },

  photoBtn: { position: "absolute", right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentVolt, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bgSecondary },
  uploadingTxt: { color: colors.accentVolt, fontSize: 10, letterSpacing: 3, fontWeight: "700", marginTop: 6 },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, padding: 12 },
  toggleHint: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.borderSubtle, padding: 3, justifyContent: "center" },
  toggleTrackOn: { backgroundColor: colors.accentVolt },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  toggleThumbOn: { transform: [{ translateX: 18 }], backgroundColor: "#000" },

  pushBtn: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,255,0,0.10)", borderColor: "rgba(212,255,0,0.40)", borderWidth: 1, borderRadius: radius.md, paddingVertical: 12 },
  pushBtnTxt: { color: colors.accentVolt, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  themeBtn: { marginTop: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12 },
  themeBtnTxt: { color: colors.textPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  themeBtnHint: { color: colors.textMuted, fontWeight: "700", letterSpacing: 1.5, fontSize: 9, marginTop: 4 },

  blockBtn: { marginTop: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.40)", backgroundColor: "rgba(239,68,68,0.10)", borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  blockBtnActive: { backgroundColor: colors.statusCant, borderColor: colors.statusCant },
  blockBtnTxt: { color: colors.statusCant, fontWeight: "900", letterSpacing: 2, fontSize: 12 },

  deleteBtn: { borderWidth: 1, borderColor: "rgba(239,68,68,0.40)", borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  deleteBtnTxt: { color: colors.statusCant, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  deleteBlock: { borderWidth: 1, borderColor: "rgba(239,68,68,0.40)", borderRadius: radius.md, padding: 12, backgroundColor: "rgba(239,68,68,0.05)" },
  deleteHint: { color: colors.textSecondary, fontSize: 11, marginVertical: 6 },
  deleteConfirm: { flex: 1, backgroundColor: colors.statusCant, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center" },
  deleteConfirmTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 11 },

  reportsBlock: { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.30)", borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 12 },
  reportsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reportsEyebrow: { color: colors.statusCant, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  reportsChevron: { color: colors.statusCant, fontSize: 16, fontWeight: "900" },
  reportItem: { backgroundColor: colors.bgPrimary, borderRadius: radius.sm, padding: 10, marginTop: 8 },
  reportSnapshotName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  reportSnapshotText: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  reportMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4, letterSpacing: 1 },
  reportDismiss: { flex: 1, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.sm, paddingVertical: 8, alignItems: "center" },
  reportDismissTxt: { color: colors.textSecondary, fontWeight: "700", letterSpacing: 2, fontSize: 10 },
  reportDelete: { flex: 1, backgroundColor: colors.statusCant, borderRadius: radius.sm, paddingVertical: 8, alignItems: "center", flexDirection: "row", justifyContent: "center" },
  reportDeleteTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 10 },
});
