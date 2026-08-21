import React, { useEffect, useState, useCallback } from "react";
import { api, formatDetail } from "../lib/api";
import { toast } from "sonner";
import { Coffee, Plus, Save, Trash2, Pencil, X } from "lucide-react";

function RuleRow({ rule, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [pattern, setPattern] = useState(rule.pattern);
  const [cafe, setCafe] = useState(rule.cafe);
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    if (busy) return;
    const p = pattern.trim().toLowerCase();
    const c = cafe.trim();
    if (!p || !c) {
      toast.error("Pattern and café are both required");
      return;
    }
    setBusy(true);
    try {
      const { data: updated } = await api.patch(`/admin/cafe-rules/${rule.id}`, { pattern: p, cafe: c });
      onSaved(updated);
      setEditing(false);
      toast("Rule updated");
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setBusy(false);
    }
  }, [busy, pattern, cafe, rule.id, onSaved]);

  const del = useCallback(async () => {
    if (busy) return;
    if (!window.confirm(`Delete rule "${rule.pattern}" → ${rule.cafe}?`)) return;
    setBusy(true);
    try {
      await api.del(`/admin/cafe-rules/${rule.id}`);
      onDeleted(rule.id);
      toast("Rule deleted");
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setBusy(false);
    }
  }, [busy, rule.id, rule.pattern, rule.cafe, onDeleted]);

  const cancel = () => {
    setPattern(rule.pattern);
    setCafe(rule.cafe);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-bg-primary rounded-lg text-[13px]"
        data-testid={`cafe-rule-${rule.pattern}`}
      >
        <div className="flex-1 min-w-0">
          <div className="font-bold text-text-primary truncate">{rule.pattern}</div>
          <div className="text-text-secondary truncate text-[12px]">{rule.cafe}</div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-text-secondary hover:text-brand-accent p-1"
          aria-label="Edit rule"
          data-testid={`cafe-rule-edit-${rule.pattern}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={del}
          disabled={busy}
          className="text-status-cant hover:text-status-cant p-1 disabled:opacity-40"
          aria-label="Delete rule"
          data-testid={`cafe-rule-delete-${rule.pattern}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="space-y-1.5 px-3 py-2 bg-bg-primary rounded-lg text-[13px] border border-brand-accent/30"
      data-testid={`cafe-rule-editing-${rule.pattern}`}
    >
      <input
        type="text"
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder="pattern (e.g. sunday spin)"
        className="w-full bg-bg-secondary px-2 py-1 rounded text-text-primary text-[13px] focus:outline-none focus:ring-1 focus:ring-brand-accent"
        data-testid="cafe-rule-input-pattern"
      />
      <input
        type="text"
        value={cafe}
        onChange={(e) => setCafe(e.target.value)}
        placeholder="Café · Address"
        className="w-full bg-bg-secondary px-2 py-1 rounded text-text-primary text-[13px] focus:outline-none focus:ring-1 focus:ring-brand-accent"
        data-testid="cafe-rule-input-cafe"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 bg-brand-accent text-black rounded py-1 text-[10px] uppercase tracking-widest font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1"
          data-testid="cafe-rule-save"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className="flex-1 border border-border-subtle text-text-secondary rounded py-1 text-[10px] uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-1"
          data-testid="cafe-rule-cancel"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

function NewRuleRow({ onCreated }) {
  const [pattern, setPattern] = useState("");
  const [cafe, setCafe] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (busy) return;
    const p = pattern.trim().toLowerCase();
    const c = cafe.trim();
    if (!p || !c) {
      toast.error("Pattern and café are both required");
      return;
    }
    setBusy(true);
    try {
      const created = await api.post("/admin/cafe-rules", { pattern: p, cafe: c });
      onCreated(created);
      setPattern("");
      setCafe("");
      toast(`Added "${created.pattern}"`);
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setBusy(false);
    }
  }, [busy, pattern, cafe, onCreated]);

  return (
    <div className="space-y-1.5 px-3 py-2 bg-bg-primary rounded-lg text-[13px] border border-dashed border-brand-accent/40" data-testid="cafe-rule-new">
      <div className="text-[10px] font-mono-stat uppercase tracking-widest text-brand-accent mb-1">
        Add rule
      </div>
      <input
        type="text"
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder="Ride name or neighbourhood (e.g. julie andrews)"
        className="w-full bg-bg-secondary px-2 py-1 rounded text-text-primary text-[13px] focus:outline-none focus:ring-1 focus:ring-brand-accent"
        data-testid="cafe-rule-new-pattern"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <input
        type="text"
        value={cafe}
        onChange={(e) => setCafe(e.target.value)}
        placeholder="Café name · Street, Suburb"
        className="w-full bg-bg-secondary px-2 py-1 rounded text-text-primary text-[13px] focus:outline-none focus:ring-1 focus:ring-brand-accent"
        data-testid="cafe-rule-new-cafe"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button
        onClick={submit}
        disabled={busy || !pattern.trim() || !cafe.trim()}
        className="w-full bg-brand-accent text-black rounded py-1.5 text-[10px] uppercase tracking-widest font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1"
        data-testid="cafe-rule-new-submit"
      >
        <Plus className="w-3 h-3" /> {busy ? "Adding…" : "Add rule"}
      </button>
    </div>
  );
}

export default function CafeRulesAdmin() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/cafe-rules");
      setRules(res.rules || []);
    } catch (e) {
      toast.error(formatDetail(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && rules.length === 0 && !loading) {
      load();
    }
  }, [open, rules.length, loading, load]);

  const onCreated = (rule) => setRules((prev) => [...prev, rule]);
  const onSaved = (rule) =>
    setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
  const onDeleted = (id) => setRules((prev) => prev.filter((r) => r.id !== id));

  const visible = filter.trim()
    ? rules.filter(
        (r) =>
          r.pattern.toLowerCase().includes(filter.toLowerCase()) ||
          r.cafe.toLowerCase().includes(filter.toLowerCase()),
      )
    : rules;

  return (
    <div
      className="bg-bg-secondary border border-border-subtle rounded-xl p-3 mb-3"
      data-testid="cafe-rules-admin"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
        data-testid="cafe-rules-toggle"
      >
        <span className="text-[10px] uppercase font-mono-stat tracking-widest text-text-secondary inline-flex items-center gap-1.5">
          <Coffee className="w-3.5 h-3.5" /> Café rules
          {rules.length > 0 && ` · ${rules.length}`}
        </span>
        <span className="text-text-secondary font-black">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2 mt-3">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rules…"
            className="w-full bg-bg-primary px-2 py-1.5 rounded text-text-primary text-[12px] focus:outline-none focus:ring-1 focus:ring-brand-accent"
            data-testid="cafe-rules-filter"
          />
          <NewRuleRow onCreated={onCreated} />
          {loading && rules.length === 0 ? (
            <div className="text-center text-[11px] uppercase tracking-widest text-text-muted py-4">
              Loading rules…
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto no-scrollbar pr-1">
              {visible.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  onSaved={onSaved}
                  onDeleted={onDeleted}
                />
              ))}
              {visible.length === 0 && rules.length > 0 && (
                <div className="text-center text-[11px] text-text-muted py-3">
                  No rules match "{filter}".
                </div>
              )}
              {rules.length === 0 && !loading && (
                <div className="text-center text-[11px] text-text-muted py-3">
                  No rules yet — add the first one above.
                </div>
              )}
            </div>
          )}
          <div className="text-[10px] text-text-muted italic pt-1 leading-relaxed">
            First keyword match wins. Order matches list order (top wins). Rides
            not matching any rule fall back to the ride's hand-set café.
          </div>
        </div>
      )}
    </div>
  );
}
