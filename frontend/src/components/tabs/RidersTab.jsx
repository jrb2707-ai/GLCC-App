import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../../lib/api";
import { useAuth, useEvents } from "../../lib/store";
import { COFFEES, initials } from "../../lib/util";
import { Check, X, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

function ProfileModal({ rider, onClose, onSaved }) {
  const { user } = useAuth();
  const [name, setName] = useState(rider.name);
  const [role, setRole] = useState(rider.role || "Member");
  const [bio, setBio] = useState(rider.bio || "");
  const [coffee, setCoffee] = useState(rider.coffee || "Medium Flat White");
  const isMe = rider.id === user.id;
  const canEditAll = user.is_admin || isMe;
  const isPresident = user.is_president;

  async function save() {
    try {
      const url = isMe ? "/riders/me" : `/riders/${rider.id}`;
      const body = isMe ? { name, bio, coffee } : { name, role, bio, coffee };
      const { data } = await api.patch(url, body);
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
    <div className="absolute inset-0 z-30 bg-black/60 flex items-end" data-testid="profile-modal">
      <div className="w-full max-h-[85%] overflow-y-auto no-scrollbar bg-bg-secondary border-t border-border-subtle rounded-t-3xl p-5 pb-8 animate-slide-down">
        <div className="w-10 h-1 rounded-full bg-border-subtle mx-auto mb-4" />
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-accent-volt/15 text-accent-volt flex items-center justify-center font-heading font-black text-xl">
            {initials(rider.name)}
          </div>
          <div>
            <div className="font-heading text-2xl font-black uppercase leading-none">{rider.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] uppercase font-mono-stat tracking-widest text-text-secondary">{rider.role}</span>
              {rider.is_admin && (
                <span className="text-[9px] uppercase tracking-widest font-bold bg-accent-volt/15 text-accent-volt border border-accent-volt/30 px-1.5 rounded">
                  {rider.is_president ? "El Prez" : "Admin"}
                </span>
              )}
              {rider.status === "pending" && (
                <span className="text-[9px] uppercase tracking-widest font-bold bg-status-maybe/15 text-status-maybe border border-status-maybe/30 px-1.5 rounded">
                  Pending
                </span>
              )}
            </div>
          </div>
        </div>

        {!canEditAll ? (
          <div className="mt-4 text-sm text-text-secondary" data-testid="profile-view-only">{rider.bio || "No bio yet."}</div>
        ) : (
          <div className="mt-4 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Bio"
              className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm resize-none"
              data-testid="profile-bio"
            />
            <div>
              <div className="text-[10px] uppercase font-mono-stat tracking-widest text-text-muted mb-1">Coffee</div>
              <div className="grid grid-cols-2 gap-2">
                {COFFEES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCoffee(c)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs ${
                      coffee === c
                        ? "bg-accent-volt/15 border-accent-volt text-accent-volt"
                        : "bg-bg-primary border-border-subtle text-text-secondary"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
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

        {user.is_admin && !isMe && (
          <div className="mt-5 pt-4 border-t border-border-subtle">
            <div className="text-[10px] font-mono-stat uppercase tracking-widest text-text-muted mb-2">Admin actions</div>
            <div className="flex flex-wrap gap-2">
              {isPresident && !rider.is_admin && (
                <button onClick={() => act("make_admin")} className="text-xs uppercase tracking-widest bg-accent-volt/15 border border-accent-volt/40 text-accent-volt px-3 py-2 rounded-lg" data-testid="admin-make">
                  <Shield className="inline w-3 h-3 mr-1" /> Make admin
                </button>
              )}
              {isPresident && rider.is_admin && !rider.is_president && (
                <button onClick={() => act("remove_admin")} className="text-xs uppercase tracking-widest bg-bg-primary border border-border-subtle text-text-secondary px-3 py-2 rounded-lg" data-testid="admin-remove">
                  Remove admin
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
    </div>
  );
}

function RegisterRiderModal({ onClose }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [coffee, setCoffee] = useState("Medium Flat White");

  async function submit() {
    // Admin creating a placeholder rider isn't in scope; direct people to register themselves.
    // But we can add an in-club pending entry:
    try {
      const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@glcc.pending`;
      await api.post("/auth/register", { email, password: "cycle" + Math.random().toString(36).slice(2, 8), name, coffee });
      toast("Submitted for approval");
      onClose();
    } catch (e) {
      toast.error(formatDetail(e));
    }
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-end" data-testid="register-modal">
      <div className="w-full bg-bg-secondary border-t border-border-subtle rounded-t-3xl p-5 pb-8 animate-slide-down">
        <div className="w-10 h-1 rounded-full bg-border-subtle mx-auto mb-4" />
        <div className="text-[10px] font-mono-stat uppercase tracking-widest text-accent-volt">Register a rider</div>
        <h3 className="font-heading text-2xl font-black uppercase mt-1">New rider</h3>
        <div className="space-y-2 mt-3">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
            data-testid="register-name"
          />
          <select
            value={coffee}
            onChange={(e) => setCoffee(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-sm"
          >
            {COFFEES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-border-subtle text-text-secondary uppercase tracking-widest text-xs py-2.5 rounded-xl" data-testid="register-cancel">
            Cancel
          </button>
          <button onClick={submit} disabled={!name} className="flex-1 bg-accent-volt text-black font-bold uppercase tracking-widest text-xs py-2.5 rounded-xl disabled:opacity-50" data-testid="register-submit">
            Submit for approval
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RidersTab() {
  const { user } = useAuth();
  const { subscribe } = useEvents();
  const [riders, setRiders] = useState([]);
  const [pending, setPending] = useState([]);
  const [openRider, setOpenRider] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/riders");
      setRiders(data.riders);
      setPending(data.pending);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((evt) => {
      if (["rider.updated", "rider.pending", "rider.deleted"].includes(evt.type)) {
        load();
      }
    });
  }, [subscribe, load]);

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

      <button
        onClick={() => setRegisterOpen(true)}
        className="w-full flex items-center justify-center gap-2 bg-bg-secondary border border-dashed border-accent-volt/40 text-accent-volt uppercase tracking-widest text-xs font-bold py-3 rounded-xl mb-3"
        data-testid="register-rider-button"
      >
        <UserPlus className="w-4 h-4" /> Register a rider
      </button>

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
            <div className="w-10 h-10 rounded-xl bg-accent-volt/15 text-accent-volt flex items-center justify-center font-heading font-black">
              {initials(r.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-semibold truncate">{r.name}</div>
                {r.is_admin && (
                  <span className="text-[9px] uppercase tracking-widest font-bold bg-accent-volt/15 text-accent-volt border border-accent-volt/30 px-1.5 rounded">
                    {r.is_president ? "El Prez" : "Admin"}
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

      {openRider && (
        <ProfileModal
          rider={openRider}
          onClose={() => setOpenRider(null)}
          onSaved={() => load()}
        />
      )}
      {registerOpen && <RegisterRiderModal onClose={() => { setRegisterOpen(false); load(); }} />}
    </div>
  );
}
