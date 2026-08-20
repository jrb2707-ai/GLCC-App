import React, { useState } from "react";
import { useAuth } from "../lib/store";
import { COFFEES, IMG } from "../lib/util";
import { formatDetail } from "../lib/api";
import { motion } from "framer-motion";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("jb@glcc.club");
  const [password, setPassword] = useState("president123");
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("Medium Flat White");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register({ email, password, name, coffee });
    } catch (er) {
      setErr(formatDetail(er));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative h-full w-full flex flex-col" data-testid="auth-screen">
      <div className="absolute inset-0">
        <img
          src="https://customer-assets-lxgj4vgw.emergentagent.net/job_mobile-craft-4628/artifacts/333y5kuk_IMG_1629.JPG"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-bg-primary/40 to-bg-primary" />
      </div>

      <div className="relative flex-1 flex flex-col justify-end px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-accent-volt shadow-volt pulse-volt" />
            <span className="font-mono-stat text-[10px] uppercase tracking-[0.3em] text-brand-accent">
              Grey Lynn Cycle Club
            </span>
          </div>
          <h1 className="font-heading text-[54px] leading-[0.95] font-black uppercase text-text-primary">
            GLCC
          </h1>
          <p className="mt-1 text-text-secondary text-sm">
            4th best cycle club in Grey Lynn. Ride hard, coffee harder.
          </p>
        </motion.div>

        <form onSubmit={submit} className="mt-8 space-y-3" data-testid="auth-form">
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setMode("login")}
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
              onClick={() => setMode("register")}
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
              <input
                type="text"
                required
                placeholder="Rider name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-volt/60"
                data-testid="input-name"
              />
              <select
                value={coffee}
                onChange={(e) => setCoffee(e.target.value)}
                className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-volt/60"
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

          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-volt/60"
            data-testid="input-email"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-volt/60"
            data-testid="input-password"
          />

          {err && (
            <div className="text-status-cant text-xs bg-status-cant/10 border border-status-cant/30 rounded-lg px-3 py-2" data-testid="auth-error">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-accent-volt text-black font-bold uppercase tracking-widest py-3 rounded-xl shadow-volt active:scale-[0.98] transition disabled:opacity-60"
            data-testid="submit-auth"
          >
            {loading ? "…" : mode === "login" ? "Enter Clubhouse" : "Request to Join"}
          </button>

          {mode === "register" && (
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-mono-stat text-center">
              An admin will approve your rider profile
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
