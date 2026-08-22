import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { COFFEES } from "../../lib/util";
import Avatar from "../Avatar";
import { resizeAvatarFile } from "../../lib/image";
import { usePullToDismiss } from "../../lib/usePullToDismiss";
import { Check, X, Shield, Trash2, UserPlus, Camera, KeyRound, Mail, MessageCircle, CreditCard } from "lucide-react";
import MemberCard from "../MemberCard";
import CafeRulesAdmin from "../CafeRulesAdmin";
import { toast } from "sonner";

function ChangeEmailBlock() {
  const { user, refreshMe } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting || !current || !newEmail.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/auth/change-email", { current_password: current, new_email: newEmail.trim() });
      toast("Email updated");
      setCurrent(""); setNewEmail("");
      setOpen(false);
      await refreshMe();
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold text-text-secondary border border-border-subtle rounded-xl py-2.5 hover:border-accent-volt/40 hover:text-brand-accent"
        data-testid="change-email-open"
      >
        <Mail className="w-3.5 h-3.5" /> Change email
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 bg-bg-primary border border-border-subtle rounded-xl p-3" data-testid="change-email-block">
      <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">Change email</div>
      <div className="text-[11px] text-text-secondary">Current: <span className="text-text-primary">{user.email || "—"}</span></div>
      <input
        type="password"
        placeholder="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm"
        data-testid="change-email-current-password"
      />
      <input
        type="email"
        placeholder="New email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm"
        data-testid="change-email-new"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { setOpen(false); setCurrent(""); setNewEmail(""); }}
          className="flex-1 border border-border-subtle text-text-secondary uppercase tracking-widest text-xs py-2 rounded-lg"
          data-testid="change-email-cancel"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || !current || !newEmail.trim()}
          className="flex-1 bg-accent-volt text-black font-bold uppercase tracking-widest text-xs py-2 rounded-lg disabled:opacity-50"
          data-testid="change-email-submit"
        >
          {submitting ? "…" : "Update"}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordBlock() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    if (next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast("Password updated");
      setCurrent(""); setNext(""); setConfirm("");
      setOpen(false);
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold text-text-secondary border border-border-subtle rounded-xl py-2.5 hover:border-accent-volt/40 hover:text-brand-accent"
        data-testid="change-password-open"
      >
        <KeyRound className="w-3.5 h-3.5" /> Change password
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 bg-bg-primary border border-border-subtle rounded-xl p-3" data-testid="change-password-block">
      <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">Change password</div>
      <input
        type="password"
        placeholder="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm"
        data-testid="change-current-password"
      />
      <input
        type="password"
        placeholder="New password (min 8)"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm"
        data-testid="change-new-password"
      />
      <input
        type="password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm"
        data-testid="change-confirm-password"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { setOpen(false); setCurrent(""); setNext(""); setConfirm(""); }}
          className="flex-1 border border-border-subtle text-text-secondary uppercase tracking-widest text-xs py-2 rounded-lg"
          data-testid="change-password-cancel"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || !current || !next}
          className="flex-1 bg-accent-volt text-black font-bold uppercase tracking-widest text-xs py-2 rounded-lg disabled:opacity-50"
          data-testid="change-password-submit"
        >
          {submitting ? "…" : "Update"}
        </button>
      </div>
    </div>
  );
}

function ProfileModal({ rider, onClose, onSaved, isBlocked, onLogout, onBlockChange }) {
  const { user, refreshMe } = useAuth();
  const [name, setName] = useState(rider.name);
  const [role, setRole] = useState(rider.role || "Member");
  const [bio, setBio] = useState(rider.bio || "");
  const [coffee, setCoffee] = useState(rider.coffee || "Medium Flat White");
  const [photo, setPhoto] = useState(rider.photo || null);
  const [uploading, setUploading] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePwd, setDeletePwd] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef(null);
  const isMe = rider.id === user.id;
  const selfPending = isMe && user.status === "pending";
  const canEditAll = (user.is_admin || isMe) && !selfPending;
  const isPresident = user.is_president;
  const { handlers: dragHandlers, dy, dragging } = usePullToDismiss({ onDismiss: onClose });

  async function toggleBlock() {
    try {
      if (isBlocked) {
        await api.delete(`/blocks/${rider.id}`);
        toast("Unblocked");
      } else {
        if (!window.confirm("Block this rider? You won't see their chat messages and they can't @mention you.")) return;
        await api.post("/blocks", { target_id: rider.id });
        toast("Blocked");
      }
      await onBlockChange?.();
      if (!isBlocked) onClose();
    } catch (e) { toast.error(formatDetail(e)); }
  }

  async function submitDeleteAccount() {
    if (deleting) return;
    if (!deletePwd) return toast.error("Enter your password to confirm");
    setDeleting(true);
    try {
      await api.delete("/auth/me", { data: { password: deletePwd } });
      toast("Account deleted");
      onLogout?.();
    } catch (e) {
      toast.error(formatDetail(e));
    } finally { setDeleting(false); }
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error("Please pick an image file");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await resizeAvatarFile(file);
      setPhoto(dataUrl);
    } catch (err) {
      toast.error("Couldn't read that image");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    try {
      const url = isMe ? "/riders/me" : `/riders/${rider.id}`;
      const body = isMe
        ? { name, coffee, photo }
        : { name, role, bio, photo };
      const { data } = await api.patch(url, body);
      if (isMe) await refreshMe();
      onSaved(data);
      toast("Profile saved");
      onClose();
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  async function act(action) {
    try {
      await api.post("/riders/action", { action, target_id: rider.id });
      toast(`Action: ${action.replace("_", " ")}`);
      onSaved({ ...rider, _refresh: true });
      onClose();
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 bg-black/60 flex items-end"
      data-testid="profile-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-h-[85%] overflow-y-auto no-scrollbar bg-bg-secondary border-t border-border-subtle rounded-t-3xl p-5 pb-8 animate-slide-down"
        style={{
          transform: dy ? `translateY(${dy}px)` : undefined,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.9, 0.4, 1)",
        }}
      >
        <div
          {...dragHandlers}
          className="pt-1 pb-3 -mx-5 px-5 -mt-5 mb-1 select-none"
          data-testid="profile-drag-handle"
        >
          <div className="w-10 h-1 rounded-full bg-border-subtle mx-auto" />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar name={rider.name} photo={photo} size="lg" testId="profile-avatar" />
            {canEditAll && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent-volt text-black flex items-center justify-center shadow-volt active:scale-95"
                title="Change photo"
                data-testid="profile-photo-button"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickFile}
              data-testid="profile-photo-input"
            />
          </div>
          <div>
            <div className="font-heading text-2xl font-black uppercase leading-none">{rider.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] uppercase font-mono-stat tracking-widest text-text-secondary">{rider.role}</span>
              {rider.is_admin && (
                <span className="text-[9px] uppercase tracking-widest font-bold bg-accent-volt/15 text-brand-accent border border-accent-volt/30 px-1.5 rounded">
                  {rider.is_president ? "El Prez" : "Admin"}
                </span>
              )}
              {rider.status === "pending" && (
                <span className="text-[9px] uppercase tracking-widest font-bold bg-status-maybe/15 text-status-maybe border border-status-maybe/30 px-1.5 rounded">
                  Pending
                </span>
              )}
              {rider.status === "invited" && (
                <span className="text-[9px] uppercase tracking-widest font-bold bg-status-maybe/15 text-status-maybe border border-status-maybe/30 px-1.5 rounded">
                  Invited
                </span>
              )}
            </div>
            {uploading && (
              <div className="text-[10px] font-mono-stat uppercase tracking-widest text-brand-accent mt-1">
                Resizing…
              </div>
            )}
          </div>
        </div>

        {!canEditAll ? (
          <div className="mt-4 text-sm text-text-secondary" data-testid="profile-view-only">{rider.bio || "No bio yet."}</div>
        ) : (
          <div className="mt-4 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rider name"
              className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
              data-testid="profile-name"
            />
            {user.is_admin && !isMe && (
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Role (Ride Captain, Sweep…)"
                className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
                data-testid="profile-role"
              />
            )}
            {user.is_admin && !isMe && (
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Bio"
                className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm resize-none"
                data-testid="profile-bio"
              />
            )}
            {isMe && (
              <div>
                <div className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted mb-1">Coffee</div>
                <div className="grid grid-cols-2 gap-2">
                  {COFFEES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCoffee(c)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs ${
                        coffee === c
                          ? "bg-accent-volt/15 border-accent-volt text-brand-accent"
                          : "bg-bg-primary border-border-subtle text-text-secondary"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isMe && rider.created_at && (
              <div className="mt-1 flex items-center justify-between rounded-xl border border-border-subtle bg-bg-primary px-3 py-2.5" data-testid="profile-since">
                <div>
                  <div className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted">Member since</div>
                  <div className="text-sm text-text-primary">
                    {new Date(rider.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </div>
                </div>
                {rider.member_no != null && (
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted">Member No.</div>
                    <div className="font-heading text-sm font-black tabular-nums text-text-primary">#{String(rider.member_no).padStart(4, "0")}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {canEditAll && (
            <button
              onClick={save}
              className="flex-1 bg-accent-volt text-black font-bold uppercase tracking-widest text-xs py-2.5 rounded-xl"
              data-testid="profile-save"
            >
              Save
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 border border-border-subtle text-text-secondary uppercase tracking-widest text-xs py-2.5 rounded-xl"
            data-testid="profile-close"
          >
            Close
          </button>
        </div>

        <div className="mt-3">
          <button
            onClick={() => setCardOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-black text-white uppercase tracking-widest text-xs font-bold py-2.5 rounded-xl active:scale-[0.99]"
            data-testid="view-member-card"
          >
            <CreditCard className="w-4 h-4" />
            View member card {rider.member_no != null && <span className="text-white/60 ml-1">#{String(rider.member_no).padStart(4, "0")}</span>}
          </button>
        </div>

        {isMe && user.status === "approved" && (
          <>
            <ChangeEmailBlock />
            <ChangePasswordBlock />
          </>
        )}

        {!isMe && !rider.is_president && (
          <button
            onClick={toggleBlock}
            className={`mt-3 w-full text-xs uppercase tracking-widest font-bold py-3 rounded-xl border ${
              isBlocked
                ? "bg-status-cant text-white border-status-cant"
                : "bg-status-cant/10 text-status-cant border-status-cant/40"
            }`}
            data-testid={isBlocked ? "unblock-rider" : "block-rider"}
          >
            {isBlocked ? "✓ Blocked · tap to unblock" : "🚫 Block this rider"}
          </button>
        )}

        {isMe && (
          <div className="mt-4">
            <button
              onClick={async () => {
                try {
                  const { data } = await api.post("/push/test");
                  toast(data.ok ? `Test push sent to ${data.sent} device${data.sent === 1 ? "" : "s"} · check lock screen` : "No registered devices — open the app on your phone first");
                } catch (e) {
                  toast.error(formatDetail(e));
                }
              }}
              className="w-full text-xs uppercase tracking-widest font-bold py-3 rounded-xl border border-brand-accent/40 text-brand-accent hover:bg-brand-accent/10"
              data-testid="test-push-button"
            >
              📱 Send me a test push
            </button>
          </div>
        )}

        {isMe && !isPresident && (
          <div className="mt-4">
            {!deleteOpen ? (
              <button
                onClick={() => setDeleteOpen(true)}
                className="w-full text-xs uppercase tracking-widest font-bold py-3 rounded-xl border border-status-cant/40 text-status-cant"
                data-testid="delete-account-open"
              >
                Delete my account
              </button>
            ) : (
              <div className="rounded-xl border border-status-cant/40 bg-status-cant/5 p-3" data-testid="delete-account-block">
                <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">Delete account</div>
                <p className="text-[11px] text-text-secondary my-2">
                  Your rider profile is removed. Chat messages you sent stay in the history but appear as "Former rider".
                </p>
                <input
                  type="password"
                  value={deletePwd}
                  onChange={(e) => setDeletePwd(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary"
                  data-testid="delete-account-password"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { setDeleteOpen(false); setDeletePwd(""); }}
                    className="flex-1 border border-border-subtle rounded-lg py-2 text-xs uppercase tracking-widest text-text-secondary"
                    data-testid="delete-account-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitDeleteAccount}
                    disabled={deleting || !deletePwd}
                    className="flex-1 bg-status-cant text-white rounded-lg py-2 text-xs uppercase tracking-widest font-bold disabled:opacity-50"
                    data-testid="delete-account-confirm"
                  >
                    {deleting ? "…" : "Delete forever"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {user.is_admin && !isMe && (
          <div className="mt-5 pt-4 border-t border-border-subtle">
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">Admin actions</div>
            <div className="flex flex-wrap gap-2">
              {isPresident && !rider.is_admin && (
                <button onClick={() => act("make_admin")} className="text-xs uppercase tracking-widest bg-accent-volt/15 border border-accent-volt/40 text-brand-accent px-3 py-2 rounded-lg" data-testid="admin-make">
                  <Shield className="inline w-3 h-3 mr-1" /> Make admin
                </button>
              )}
              {isPresident && rider.is_admin && !rider.is_president && (
                <button onClick={() => act("remove_admin")} className="text-xs uppercase tracking-widest bg-bg-primary border border-border-subtle text-text-secondary px-3 py-2 rounded-lg" data-testid="admin-remove">
                  Remove admin
                </button>
              )}
              {rider.email && rider.status !== "invited" && (
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.post("/riders/reset-password", { target_id: rider.id });
                      if (data.email_sent) {
                        toast("Reset link sent", { description: `Emailed to ${data.sent_to}` });
                      } else {
                        toast.error("Email service unavailable", { description: "Check Resend configuration" });
                      }
                    } catch (e) {
                      toast.error(formatDetail(e));
                    }
                  }}
                  className="text-xs uppercase tracking-widest bg-bg-primary border border-border-subtle text-text-secondary px-3 py-2 rounded-lg hover:border-accent-volt/40 hover:text-brand-accent"
                  data-testid="admin-reset-password"
                >
                  <KeyRound className="inline w-3 h-3 mr-1" /> Send reset link
                </button>
              )}
              {!rider.is_president && (
                <button onClick={() => act("delete")} className="text-xs uppercase tracking-widest bg-status-cant/10 border border-status-cant/40 text-status-cant px-3 py-2 rounded-lg" data-testid="admin-delete">
                  <Trash2 className="inline w-3 h-3 mr-1" /> Delete
                </button>
              )}
            </div>
            {!isPresident && (
              <div className="text-[10px] text-text-muted mt-2">Make / remove admin is President-only.</div>
            )}
          </div>
        )}
      </div>
      {cardOpen && <MemberCard rider={rider} onClose={() => setCardOpen(false)} />}
    </div>
  );
}

function RegisterRiderModal({ onClose }) {
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("Medium Flat White");
  const [role, setRole] = useState("Member");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const { handlers: dragHandlers, dy, dragging } = usePullToDismiss({ onDismiss: onClose });

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeAvatarFile(file);
      setPhoto(dataUrl);
    } catch (err) {
      toast.error("Couldn't process that photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(mode) {
    // mode: "email" | "text" | "roster-only"
    if (!name.trim() || submitting) return;
    if (mode === "email" && !email.trim()) {
      toast.error("Add an email to send an email invite");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/riders/invite", {
        name: name.trim(),
        coffee,
        role,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        photo,
        send_email: mode === "email",
      });
      if (mode === "email") {
        toast(data.email_sent ? "Invite emailed" : "Rider added — email failed", {
          description: `${data.name} joins the roster`,
        });
      } else if (mode === "text") {
        // Native share sheet (iOS/Android) or clipboard fallback
        const message = `You're invited to GLCC — Grey Lynn Cycle Club. Sign up here: ${data.invite_link}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: "GLCC invite", text: message });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(message);
            toast("Invite link copied — paste into a text message");
          } else {
            window.prompt("Copy this invite link", data.invite_link);
          }
        } catch (_) {
          /* user cancelled share sheet — silent */
        }
      } else {
        toast("Rider added to roster", { description: `${data.name}` });
      }
      onClose();
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-end" data-testid="register-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="w-full max-h-[92%] overflow-y-auto no-scrollbar bg-bg-secondary border-t border-border-subtle rounded-t-3xl p-5 pb-8 animate-slide-down"
        style={{
          transform: dy ? `translateY(${dy}px)` : undefined,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.9, 0.4, 1)",
        }}
      >
        <div
          {...dragHandlers}
          className="pt-1 pb-3 -mx-5 px-5 -mt-5 mb-1 select-none"
          data-testid="register-drag-handle"
        >
          <div className="w-10 h-1 rounded-full bg-border-subtle mx-auto" />
        </div>
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-brand-accent">Invite a rider</div>
        <h3 className="font-heading text-2xl font-black uppercase mt-1">New rider</h3>
        <p className="text-[11px] text-text-muted mt-1">
          They&apos;ll appear as <span className="text-status-maybe">Invited</span> until they sign up with their own email.
        </p>

        {/* Photo picker */}
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-16 h-16 rounded-full overflow-hidden bg-bg-primary border border-dashed border-border-subtle flex items-center justify-center text-text-muted active:scale-95"
            data-testid="register-photo-button"
          >
            {photo ? (
              <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickPhoto}
            data-testid="register-photo-input"
          />
          <div className="flex-1 text-[11px] text-text-muted leading-relaxed">
            {uploading ? "Resizing…" : photo ? "Tap the avatar to change photo." : "Optional — tap the avatar to add a photo."}
          </div>
          {photo && !uploading && (
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="text-[10px] uppercase tracking-widest text-status-cant"
              data-testid="register-photo-remove"
            >
              Remove
            </button>
          )}
        </div>

        <div className="space-y-2 mt-4">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
            data-testid="register-name"
          />
          <input
            placeholder="Role (Member, Ride Captain…)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
            data-testid="register-role"
          />
          <select
            value={coffee}
            onChange={(e) => setCoffee(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
            data-testid="register-coffee"
          >
            {COFFEES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="email"
            placeholder="Email (for email invite)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
            data-testid="register-email"
          />
          <input
            type="tel"
            placeholder="Phone (for text invite)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
            data-testid="register-phone"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => submit("email")}
            disabled={!name.trim() || !email.trim() || submitting}
            className="bg-accent-volt text-black font-bold uppercase tracking-widest text-xs py-2.5 rounded-xl disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            data-testid="register-send-email"
          >
            <Mail className="w-3.5 h-3.5" />
            {submitting ? "Sending…" : "Send email"}
          </button>
          <button
            onClick={() => submit("text")}
            disabled={!name.trim() || submitting}
            className="bg-white text-black font-bold uppercase tracking-widest text-xs py-2.5 rounded-xl disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            data-testid="register-send-text"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Send text
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-border-subtle text-text-secondary uppercase tracking-widest text-xs py-2.5 rounded-xl"
            data-testid="register-cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => submit("roster-only")}
            disabled={!name.trim() || submitting}
            className="flex-1 border border-brand-accent/40 text-brand-accent uppercase tracking-widest text-xs py-2.5 rounded-xl disabled:opacity-40"
            data-testid="register-roster-only"
          >
            Add without inviting
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RidersTab() {
  const { user, logout } = useAuth();
  const { subscribe } = useEvents();
  const [riders, setRiders] = useState([]);
  const [pending, setPending] = useState([]);
  const [blockedIds, setBlockedIds] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [processingReport, setProcessingReport] = useState(null);
  const [openRider, setOpenRider] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, b, rep] = await Promise.all([
        api.get("/riders"),
        api.get("/blocks").catch(() => ({ data: { blocked_ids: [] } })),
        user.is_admin
          ? api.get("/admin/reports?status_filter=open").catch(() => ({ data: { reports: [] } }))
          : Promise.resolve({ data: { reports: [] } }),
      ]);
      setRiders(r.data.riders);
      setPending(r.data.pending);
      setBlockedIds(b.data.blocked_ids || []);
      setReports(rep.data.reports || []);
    } catch (e) {
      // ignore
    }
  }, [user.is_admin]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((evt) => {
      if (["rider.updated", "rider.pending", "rider.deleted", "chat.report", "chat.deleted"].includes(evt.type)) {
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
      toast(action === "delete" ? "Message deleted" : "Report dismissed");
      await load();
    } catch (e) { toast.error(formatDetail(e)); }
    finally { setProcessingReport(null); }
  }

  async function decidePending(id, action) {
    try {
      await api.post("/riders/action", { action, target_id: id });
      toast(action === "approve" ? "Rider approved" : "Rider denied");
      load();
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  return (
    <div className="px-4 pt-4 pb-6" data-testid="riders-tab">
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-heading text-3xl font-black uppercase">Riders</h2>
        <span className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted">
          {riders.length} members
        </span>
      </div>

      {user.is_admin && (
        <button
          onClick={() => setRegisterOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-bg-secondary border border-dashed border-accent-volt/40 text-brand-accent uppercase tracking-widest text-xs font-bold py-3 rounded-xl mb-3"
          data-testid="register-rider-button"
        >
          <UserPlus className="w-4 h-4" /> Invite a rider
        </button>
      )}

      {user.is_admin && <CafeRulesAdmin />}

      {user.is_admin && reports.length > 0 && (
        <div className="bg-status-cant/10 border border-status-cant/30 rounded-xl p-3 mb-3" data-testid="reports-block">
          <button
            onClick={() => setReportsOpen((v) => !v)}
            className="w-full flex items-center justify-between"
            data-testid="reports-toggle"
          >
            <span className="text-[10px] uppercase font-mono-stat tracking-widest text-status-cant">
              🚩 Reported messages · {reports.length}
            </span>
            <span className="text-status-cant font-black">{reportsOpen ? "−" : "+"}</span>
          </button>
          {reportsOpen && (
            <div className="space-y-2 mt-2">
              {reports.map((r) => (
                <div key={r.id} className="bg-bg-primary rounded-lg p-3" data-testid={`report-item-${r.id}`}>
                  <div className="text-[11px] font-bold text-text-primary">
                    {r.message_snapshot?.name || "Unknown"} · <span className="text-status-cant">{r.reason}</span>
                  </div>
                  <div className="text-sm text-text-secondary mt-1 line-clamp-4">
                    {r.message_snapshot?.text || "(message deleted)"}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1 font-mono-stat uppercase tracking-widest">
                    Reported by {r.reporter_name}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => actOnReport(r.id, "dismiss")}
                      disabled={processingReport === r.id}
                      className="flex-1 border border-border-subtle rounded-lg py-1.5 text-[10px] uppercase tracking-widest text-text-secondary disabled:opacity-50"
                      data-testid={`report-dismiss-${r.id}`}
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => actOnReport(r.id, "delete")}
                      disabled={processingReport === r.id}
                      className="flex-1 bg-status-cant text-white rounded-lg py-1.5 text-[10px] uppercase tracking-widest font-bold disabled:opacity-50"
                      data-testid={`report-delete-${r.id}`}
                    >
                      {processingReport === r.id ? "…" : "Delete message"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {user.is_admin && pending.length > 0 && (
        <div className="bg-status-maybe/10 border border-status-maybe/30 rounded-xl p-3 mb-3" data-testid="pending-block">
          <div className="text-[10px] uppercase font-mono-stat tracking-widest text-status-maybe mb-2">
            Pending approval · {pending.length}
          </div>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-bg-primary rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-[11px] text-text-secondary truncate">{p.coffee}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => decidePending(p.id, "approve")} className="p-1.5 rounded-md bg-status-going/20 text-status-going" data-testid={`approve-${p.id}`}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => decidePending(p.id, "deny")} className="p-1.5 rounded-md bg-status-cant/20 text-status-cant" data-testid={`deny-${p.id}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {riders.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenRider(r)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-bg-secondary border border-border-subtle hover:border-accent-volt/40 transition"
            data-testid={`rider-card-${r.id}`}
          >
            <Avatar name={r.name} photo={r.photo} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-semibold truncate">{r.name}</div>
                {r.is_admin && (
                  <span className="text-[9px] uppercase tracking-widest font-bold bg-accent-volt/15 text-brand-accent border border-accent-volt/30 px-1.5 rounded">
                    {r.is_president ? "El Prez" : "Admin"}
                  </span>
                )}
                {r.status === "invited" && (
                  <span className="text-[9px] uppercase tracking-widest font-bold bg-status-maybe/15 text-status-maybe border border-status-maybe/30 px-1.5 rounded" data-testid={`invited-badge-${r.id}`}>
                    Invited
                  </span>
                )}
              </div>
              <div className="text-[11px] text-text-secondary truncate">
                {r.role} · {r.coffee}
              </div>
            </div>
          </button>
        ))}
      </div>

      {openRider && !openRider.__edit && (
        openRider.id === user.id ? (
          <ProfileModal
            rider={openRider}
            onClose={() => setOpenRider(null)}
            onSaved={() => load()}
            onLogout={logout}
            onBlockChange={load}
            isBlocked={blockedIds.includes(openRider.id)}
          />
        ) : (
          <MemberCard
            rider={openRider}
            onClose={() => setOpenRider(null)}
            onEditProfile={user.is_admin ? () => setOpenRider({ ...openRider, __edit: true }) : undefined}
            canBlock={!openRider.is_president}
            isBlocked={blockedIds.includes(openRider.id)}
            onBlockChange={load}
          />
        )
      )}
      {openRider?.__edit && (
        <ProfileModal
          rider={openRider}
          onClose={() => setOpenRider(null)}
          onSaved={() => load()}
          onLogout={logout}
          onBlockChange={load}
          isBlocked={blockedIds.includes(openRider.id)}
        />
      )}
      {registerOpen && <RegisterRiderModal onClose={() => { setRegisterOpen(false); load(); }} />}
    </div>
  );
}
