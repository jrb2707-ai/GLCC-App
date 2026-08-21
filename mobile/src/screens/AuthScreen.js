import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ImageBackground, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Modal, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/store";
import { api, formatDetail } from "../lib/api";
import { colors, COFFEES, radius, spacing } from "../constants/theme";

const HERO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_mobile-craft-4628/artifacts/333y5kuk_IMG_1629.JPG";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("Medium Flat White");
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  function clearFieldError(f) {
    if (fieldErrors[f]) {
      setFieldErrors((p) => { const n = { ...p }; delete n[f]; return n; });
    }
    if (err) setErr("");
  }

  function validate() {
    const next = {};
    const em = email.trim();
    if (!em) next.email = "Email is required";
    else if (!emailRe.test(em)) next.email = "Enter a valid email";
    if (!password) next.password = "Password is required";
    else if (mode === "register" && password.length < 8) next.password = "Password must be at least 8 characters";
    if (mode === "register" && !name.trim()) next.name = "Rider name is required";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (loading || !validate()) return;
    setErr("");
    setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else {
        const u = await register({ email: email.trim(), password, name: name.trim(), coffee });
        if (u?.status === "pending") setPendingUser(u);
      }
    } catch (e) {
      const detail = formatDetail(e);
      const status = e?.response?.status;
      if (status === 401) setErr("Email or password doesn't match — try again.");
      else if (status === 400 && /already/i.test(detail)) setErr(detail);
      else setErr(detail || "Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (pendingUser) return <PendingScreen user={pendingUser} onBack={() => setPendingUser(null)} />;

  return (
    <View style={s.root}>
      <ImageBackground source={{ uri: HERO }} style={s.hero} resizeMode="cover">
        <View style={s.scrimTop} />
        <View style={s.scrimBottom} />
      </ImageBackground>

      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={{ flex: 1 }} />

            <View style={s.glass}>
              <View style={s.eyebrowRow}>
                <View style={s.pinkDot} />
                <Text style={s.eyebrow}>GREY LYNN CYCLE CLUB</Text>
              </View>
              <Text style={s.hero1}>GLCC.</Text>
              <Text style={s.tagline}>4th best cycle club in Grey Lynn. Ride hard, coffee harder.</Text>
            </View>

            <View style={s.form}>
              <View style={s.tabs}>
                <TouchableOpacity
                  style={[s.tab, mode === "login" && s.tabActive]}
                  onPress={() => { setMode("login"); setFieldErrors({}); setErr(""); }}
                >
                  <Text style={[s.tabTxt, mode === "login" && s.tabTxtActive]}>Sign in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tab, mode === "register" && s.tabActive]}
                  onPress={() => { setMode("register"); setFieldErrors({}); setErr(""); }}
                >
                  <Text style={[s.tabTxt, mode === "register" && s.tabTxtActive]}>Join club</Text>
                </TouchableOpacity>
              </View>

              {mode === "register" && (
                <>
                  <TextInput
                    value={name}
                    onChangeText={(v) => { setName(v); clearFieldError("name"); }}
                    placeholder="Rider name"
                    placeholderTextColor={colors.textMuted}
                    style={[s.input, fieldErrors.name && s.inputError]}
                    autoCapitalize="words"
                  />
                  {fieldErrors.name && <Text style={s.errorText}>{fieldErrors.name}</Text>}

                  <TouchableOpacity style={s.input} onPress={() => setCoffeeOpen(true)}>
                    <Text style={{ color: colors.textPrimary }}>{coffee}</Text>
                  </TouchableOpacity>
                </>
              )}

              <TextInput
                value={email}
                onChangeText={(v) => { setEmail(v); clearFieldError("email"); }}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={[s.input, fieldErrors.email && s.inputError]}
              />
              {fieldErrors.email && <Text style={s.errorText}>{fieldErrors.email}</Text>}

              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v); clearFieldError("password"); }}
                placeholder={mode === "register" ? "Password (min 8 chars)" : "Password"}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={[s.input, fieldErrors.password && s.inputError]}
              />
              {fieldErrors.password && <Text style={s.errorText}>{fieldErrors.password}</Text>}

              {err ? (
                <View style={s.serverError}>
                  <Text style={{ color: colors.statusCant, fontSize: 12 }}>{err}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={s.submit} onPress={submit} disabled={loading}>
                {loading && <ActivityIndicator color="#000" style={{ marginRight: 8 }} />}
                <Text style={s.submitTxt}>
                  {loading ? (mode === "login" ? "Signing in" : "Submitting") : (mode === "login" ? "Sign in" : "Request access")}
                </Text>
              </TouchableOpacity>

              {mode === "login" && (
                <TouchableOpacity onPress={() => setForgotOpen(true)}>
                  <Text style={s.forgotLink}>FORGOT PASSWORD?</Text>
                </TouchableOpacity>
              )}
              {mode === "register" && (
                <Text style={s.approvalNote}>AN ADMIN WILL APPROVE YOUR RIDER PROFILE</Text>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <CoffeePickerModal
        open={coffeeOpen}
        onClose={() => setCoffeeOpen(false)}
        value={coffee}
        onChange={setCoffee}
      />
      <ForgotPasswordModal
        open={forgotOpen}
        initialEmail={email}
        onClose={() => setForgotOpen(false)}
      />
    </View>
  );
}

function PendingScreen({ user, onBack }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl }}>
        <View style={s.eyebrowRow}>
          <View style={s.pinkDot} />
          <Text style={s.eyebrow}>GREY LYNN CYCLE CLUB</Text>
        </View>
        <Text style={[s.hero1, { marginTop: 8 }]}>Awaiting{"\n"}approval</Text>
        <Text style={[s.tagline, { marginTop: 12, maxWidth: 320 }]}>
          Kia ora <Text style={{ fontWeight: "700" }}>{user?.name}</Text> — your request to join the club is in.
          An admin will approve your profile shortly. You&apos;ll get access to rides, coffee rounds and chat as soon as they do.
        </Text>
        <View style={s.pendingCard}>
          <Text style={{ color: colors.textPrimary, fontSize: 13 }}>
            We&apos;ve got your details on file. Feel free to close this — we&apos;ll be in touch.
          </Text>
        </View>
        <TouchableOpacity onPress={onBack} style={{ marginTop: spacing.xl }}>
          <Text style={s.forgotLink}>BACK TO SIGN IN</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function CoffeePickerModal({ open, onClose, value, onChange }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Coffee order</Text>
          <ScrollView>
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
          <TouchableOpacity onPress={onClose} style={s.sheetClose}>
            <Text style={{ color: colors.textSecondary, textAlign: "center" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ForgotPasswordModal({ open, initialEmail, onClose }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => { if (open) { setEmail(initialEmail || ""); setSent(false); setError(""); } }, [open, initialEmail]);

  async function submit() {
    if (submitting) return;
    if (!emailRe.test(email.trim())) { setError("Enter a valid email"); return; }
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (e) {
      setError(formatDetail(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Reset by email</Text>
          {sent ? (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                If <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{email}</Text> is on file, a reset link is on its way. The link expires in 60 minutes.
              </Text>
              <TouchableOpacity onPress={onClose} style={[s.submit, { marginTop: spacing.lg }]}>
                <Text style={s.submitTxt}>Got it</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Enter the email you signed up with and we&apos;ll send you a link to set a new password.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[s.input, error && s.inputError, { marginTop: spacing.md }]}
              />
              {error ? <Text style={s.errorText}>{error}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                <TouchableOpacity onPress={onClose} style={[s.submitGhost, { flex: 1 }]}>
                  <Text style={{ color: colors.textSecondary, textAlign: "center", fontWeight: "700", letterSpacing: 2 }}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submit} disabled={submitting} style={[s.submit, { flex: 1, marginTop: 0 }]}>
                  {submitting && <ActivityIndicator color="#000" style={{ marginRight: 8 }} />}
                  <Text style={s.submitTxt}>{submitting ? "Sending" : "Send link"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  hero: { ...StyleSheet.absoluteFillObject },
  scrimTop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", backgroundColor: colors.bgPrimary, opacity: 0.85 },
  overlay: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },

  glass: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinkDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accentPink },
  eyebrow: { color: colors.accentVolt, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  hero1: { color: colors.textPrimary, fontSize: 56, fontWeight: "900", letterSpacing: -2, lineHeight: 54, marginTop: 8 },
  tagline: { color: colors.textPrimary, marginTop: 6, fontWeight: "700", fontSize: 13, lineHeight: 18 },

  form: { marginTop: spacing.xl, gap: 10 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 6 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.borderSubtle, alignItems: "center",
  },
  tabActive: { backgroundColor: colors.accentVolt, borderColor: colors.accentVolt },
  tabTxt: { color: colors.textSecondary, fontSize: 12, letterSpacing: 2, fontWeight: "700" },
  tabTxtActive: { color: "#000" },

  input: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 14,
  },
  inputError: { borderColor: colors.statusCant },
  errorText: { color: colors.statusCant, fontSize: 11, marginTop: -4, marginLeft: 2 },
  serverError: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.30)",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
  },
  submit: {
    marginTop: 4,
    backgroundColor: colors.accentVolt,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: colors.accentVolt,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  submitTxt: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  submitGhost: {
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: "center",
  },

  forgotLink: { color: colors.textSecondary, textAlign: "center", fontSize: 11, letterSpacing: 3, marginTop: 4, textDecorationLine: "underline" },
  approvalNote: { color: colors.textMuted, textAlign: "center", fontSize: 10, letterSpacing: 3, marginTop: 4 },

  pendingCard: {
    marginTop: spacing.lg,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: "rgba(34,197,94,0.30)",
    borderWidth: 1,
  },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    paddingBottom: 34,
    maxHeight: "80%",
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, marginBottom: 12 },
  sheetTitle: { color: colors.textPrimary, fontWeight: "900", fontSize: 20, marginBottom: 12, letterSpacing: -0.5 },
  sheetClose: { marginTop: 12, paddingVertical: 12 },
  coffeeItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md },
  coffeeItemActive: { backgroundColor: "rgba(212,255,0,0.10)", borderWidth: 1, borderColor: colors.accentVolt },
});
