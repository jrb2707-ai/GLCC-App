import React, { useState } from "react";
import { useAuth } from "../lib/store";
import { COFFEES } from "../lib/util";
import { api, formatDetail } from "../lib/api";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

function ForgotPasswordModal({ initialEmail, onClose }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailErr, setEmailErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailErr("Enter a valid email address");
      return;
    }
    setEmailErr("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: trimmed });
      setSent(true);
    } catch (er) {
      toast.error(formatDetail(er));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/70 flex items-end" data-testid="forgot-password-modal">
      <div className="w-full bg-bg-secondary border-t border-border-subtle rounded-t-3xl p-5 pb-8 animate-slide-down">
        <div className="w-10 h-1 rounded-full bg-border-subtle mx-auto mb-4" />
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-brand-accent">Forgot password</div>
        <h3 className="font-heading text-2xl font-black uppercase mt-1">Reset by email</h3>
        {sent ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-text-secondary leading-relaxed" data-testid="forgot-sent-message">
              If <span className="text-text-primary font-semibold">{email}</span> is on file, a reset link is on its way. Check your inbox (and spam) — the link expires in 60 minutes.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-accent-volt text-black font-bold uppercase tracking-widest text-xs"
              data-testid="forgot-done"
            >
              Got it
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4 space-y-3">
            <p className="text-xs text-text-secondary leading-relaxed">
              Enter the email you signed up with and we&apos;ll send you a link to set a new password.
            </p>
            <div>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(""); }}
                className={`w-full bg-bg-primary border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none ${emailErr ? "border-status-cant focus:border-status-cant" : "border-border-subtle focus:border-accent-volt/60"}`}
                data-testid="forgot-email"
              />
              {emailErr && (
                <div className="mt-1 text-[11px] text-status-cant" data-testid="forgot-email-error">{emailErr}</div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-border-subtle text-text-secondary uppercase tracking-widest text-xs py-3 rounded-xl"
                data-testid="forgot-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-accent-volt text-black font-bold uppercase tracking-widest text-xs py-3 rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                data-testid="forgot-submit"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? "Sending" : "Send link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("Medium Flat White");
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  function clearFieldError(field) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (err) setErr("");
  }

  function validate() {
    const next = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) next.email = "Enter a valid email";

    if (!password) next.password = "Password is required";
    else if (mode === "register" && password.length < 8) next.password = "Password must be at least 8 characters";

    if (mode === "register" && !name.trim()) next.name = "Rider name is required";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;
    setErr("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        const user = await register({ email: email.trim(), password, name: name.trim(), coffee });
        if (user?.status === "pending") setPendingUser(user);
      }
    } catch (er) {
      // Friendly copy for the common 401 case
      const detail = formatDetail(er);
      const status = er?.response?.status;
      if (status === 401) setErr("Email or password doesn't match — try again.");
      else if (status === 400 && /already/i.test(detail)) setErr(detail);
      else setErr(detail || "Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputBase = "w-full bg-bg-secondary border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none";
  const errorRing = "border-status-cant focus:border-status-cant";
  const idleRing = "border-border-subtle focus:border-accent-volt/60";

  if (pendingUser) {
    return (
      <div className="relative h-full w-full flex flex-col bg-bg-primary" data-testid="pending-approval-screen">
        <div className="flex-1 flex flex-col justify-center px-6 py-10">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-accent-pink" />
            <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent">
              Grey Lynn Cycle Club
            </span>
          </div>
          <h1 className="font-heading text-4xl font-black uppercase text-text-primary leading-tight">
            Awaiting approval
          </h1>
          <p className="mt-3 text-text-secondary text-sm leading-relaxed max-w-[320px]">
            Kia ora <span className="text-text-primary font-semibold">{pendingUser.name}</span> — your request to join the club is in. An admin will approve your profile shortly. You&apos;ll get access to rides, coffee rounds and chat as soon as they do.
          </p>
          <div className="mt-6 rounded-2xl border border-status-going/30 bg-status-going/10 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-status-going flex-none mt-0.5" />
            <div className="text-xs text-text-primary leading-relaxed">
              We&apos;ve got your details on file. Feel free to close this — we&apos;ll be in touch.
            </div>
          </div>
          <button
            onClick={() => setPendingUser(null)}
            className="mt-8 w-full text-center text-[11px] uppercase tracking-widest font-mono-stat text-text-secondary hover:text-brand-accent underline underline-offset-4"
            data-testid="pending-back"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex flex-col" data-testid="auth-screen">
      <div className="absolute inset-0">
        <img
          src="https://customer-assets-lxgj4vgw.emergentagent.net/job_mobile-craft-4628/artifacts/333y5kuk_IMG_1629.JPG"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Robust scrim so hero copy stays readable no matter which photo lands here */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-bg-primary" />
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-bg-primary via-bg-primary/85 to-transparent" />
      </div>

      <div className="relative flex-1 flex flex-col justify-end px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl px-4 py-4 border border-white/10 bg-white/[0.04] backdrop-blur-sm shadow-[0_6px_24px_-14px_rgba(0,0,0,0.4)]"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-accent-pink" />
            <span className="font-mono-stat text-[10px] font-bold uppercase tracking-[0.3em] text-white" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.7)" }}>
              Grey Lynn Cycle Club
            </span>
          </div>
          <h1 className="font-heading text-[56px] leading-[0.92] font-black uppercase text-white" style={{ textShadow: "0 3px 24px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.08)" }}>
            GLCC.
          </h1>
          <p className="mt-1.5 text-white text-sm font-bold" data-testid="auth-tagline" style={{ textShadow: "0 1px 12px rgba(0,0,0,0.65)" }}>
            4th best cycle club in Grey Lynn. Ride hard, coffee harder.
          </p>
        </motion.div>

        <form onSubmit={submit} noValidate className="mt-8 space-y-3" data-testid="auth-form">
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => { setMode("login"); setFieldErrors({}); setErr(""); }}
              className={`flex-1 py-2 rounded-full text-xs uppercase tracking-widest font-semibold border ${
                mode === "login"
                  ? "bg-accent-volt text-black border-accent-volt"
                  : "bg-transparent text-text-secondary border-border-subtle"
              }`}
              data-testid="tab-login"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setFieldErrors({}); setErr(""); }}
              className={`flex-1 py-2 rounded-full text-xs uppercase tracking-widest font-semibold border ${
                mode === "register"
                  ? "bg-accent-volt text-black border-accent-volt"
                  : "bg-transparent text-text-secondary border-border-subtle"
              }`}
              data-testid="tab-register"
            >
              Join club
            </button>
          </div>

          {mode === "register" && (
            <>
              <div>
                <input
                  type="text"
                  placeholder="Rider name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError("name"); }}
                  className={`${inputBase} ${fieldErrors.name ? errorRing : idleRing}`}
                  data-testid="input-name"
                />
                {fieldErrors.name && (
                  <div className="mt-1 text-[11px] text-status-cant" data-testid="input-name-error">{fieldErrors.name}</div>
                )}
              </div>
              <select
                value={coffee}
                onChange={(e) => setCoffee(e.target.value)}
                className={`${inputBase} ${idleRing}`}
                data-testid="input-coffee"
              >
                {COFFEES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </>
          )}

          <div>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
              className={`${inputBase} ${fieldErrors.email ? errorRing : idleRing}`}
              data-testid="input-email"
            />
            {fieldErrors.email && (
              <div className="mt-1 text-[11px] text-status-cant" data-testid="input-email-error">{fieldErrors.email}</div>
            )}
          </div>
          <div>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "Password (min 8 chars)" : "Password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
              className={`${inputBase} ${fieldErrors.password ? errorRing : idleRing}`}
              data-testid="input-password"
            />
            {fieldErrors.password && (
              <div className="mt-1 text-[11px] text-status-cant" data-testid="input-password-error">{fieldErrors.password}</div>
            )}
          </div>

          {err && (
            <div className="text-status-cant text-xs bg-status-cant/10 border border-status-cant/30 rounded-lg px-3 py-2" data-testid="auth-error">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-accent-volt text-black font-bold uppercase tracking-widest py-3 rounded-xl shadow-volt active:scale-[0.98] transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
            data-testid="submit-auth"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? (mode === "login" ? "Signing in" : "Submitting") : (mode === "login" ? "Sign in" : "Request access")}
          </button>

          {mode === "login" && (
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="w-full text-center text-[11px] uppercase tracking-widest font-mono-stat text-text-secondary hover:text-brand-accent underline underline-offset-4"
              data-testid="forgot-password-link"
            >
              Forgot password?
            </button>
          )}

          {mode === "register" && (
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-mono-stat text-center">
              An admin will approve your rider profile
            </p>
          )}
        </form>
      </div>
      {forgotOpen && (
        <ForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />
      )}
    </div>
  );
}
