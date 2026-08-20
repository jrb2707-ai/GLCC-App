import React, { useState } from "react";
import { api, formatDetail } from "../lib/api";
import { toast } from "sonner";
import { KeyRound, CheckCircle2 } from "lucide-react";

export default function ResetPasswordScreen({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      toast("Password updated", { description: "You can now sign in with your new password" });
    } catch (er) {
      setErr(formatDetail(er));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden bg-bg-primary" data-testid="reset-password-screen">
      <div className="flex-1 flex flex-col justify-center px-6 py-10">
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-accent-pink" />
          <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent">
            Grey Lynn Cycle Club
          </span>
        </div>
        <h1 className="font-heading text-4xl font-black uppercase text-text-primary leading-tight">
          {done ? "You're set" : "New password"}
        </h1>
        <p className="mt-1 text-text-secondary text-sm">
          {done ? "Head back to the app and sign in." : "Choose a strong password — 8+ characters."}
        </p>

        {done ? (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-status-going/10 border border-status-going/30 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-status-going flex-none" />
              <div className="text-sm text-text-primary">Password updated successfully.</div>
            </div>
            <button
              onClick={onDone}
              className="w-full bg-accent-volt text-black font-bold uppercase tracking-widest py-3 rounded-xl shadow-volt"
              data-testid="reset-back-to-login"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted">New password</span>
              <div className="mt-1 relative">
                <KeyRound className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-bg-secondary border border-border-subtle rounded-xl pl-9 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-volt/60"
                  data-testid="reset-new-password"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted">Confirm password</span>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                className="mt-1 w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-volt/60"
                data-testid="reset-confirm-password"
              />
            </label>
            {err && (
              <div className="text-status-cant text-xs bg-status-cant/10 border border-status-cant/30 rounded-lg px-3 py-2" data-testid="reset-error">
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 bg-accent-volt text-black font-bold uppercase tracking-widest py-3 rounded-xl shadow-volt disabled:opacity-60"
              data-testid="reset-submit"
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="w-full text-center text-[11px] uppercase tracking-widest font-mono-stat text-text-secondary hover:text-brand-accent underline underline-offset-4"
              data-testid="reset-cancel"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
