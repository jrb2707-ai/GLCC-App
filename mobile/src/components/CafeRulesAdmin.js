import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { api, formatDetail } from "../lib/api";
import { colors, radius } from "../constants/theme";

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
      Alert.alert("Missing", "Pattern and café are both required.");
      return;
    }
    setBusy(true);
    try {
      const { data: updated } = await api.patch(`/admin/cafe-rules/${rule.id}`, { pattern: p, cafe: c });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      Alert.alert("Save failed", formatDetail(e));
    } finally {
      setBusy(false);
    }
  }, [busy, pattern, cafe, rule.id, onSaved]);

  const del = useCallback(() => {
    Alert.alert(
      "Delete rule",
      `Delete "${rule.pattern}" → ${rule.cafe}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await api.delete(`/admin/cafe-rules/${rule.id}`);
              onDeleted(rule.id);
            } catch (e) {
              Alert.alert("Delete failed", formatDetail(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [rule.id, rule.pattern, rule.cafe, onDeleted]);

  if (!editing) {
    return (
      <View style={s.row} testID={`cafe-rule-${rule.pattern}`}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowPattern} numberOfLines={1}>{rule.pattern}</Text>
          <Text style={s.rowCafe} numberOfLines={1}>{rule.cafe}</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing(true)} style={s.iconBtn} testID={`cafe-rule-edit-${rule.pattern}`}>
          <Text style={s.iconBtnTxt}>EDIT</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={del} disabled={busy} style={[s.iconBtn, s.iconBtnDelete]} testID={`cafe-rule-delete-${rule.pattern}`}>
          <Text style={s.iconBtnDeleteTxt}>DEL</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.row, s.rowEditing]} testID={`cafe-rule-editing-${rule.pattern}`}>
      <TextInput
        value={pattern}
        onChangeText={setPattern}
        placeholder="pattern"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={s.input}
      />
      <TextInput
        value={cafe}
        onChangeText={setCafe}
        placeholder="Café · Address"
        placeholderTextColor={colors.textMuted}
        style={s.input}
      />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <TouchableOpacity onPress={save} disabled={busy} style={s.saveBtn}>
          {busy ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.saveBtnTxt}>SAVE</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setPattern(rule.pattern); setCafe(rule.cafe); setEditing(false); }} disabled={busy} style={s.cancelBtn}>
          <Text style={s.cancelBtnTxt}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function NewRuleRow({ onCreated }) {
  const [pattern, setPattern] = useState("");
  const [cafe, setCafe] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const p = pattern.trim().toLowerCase();
    const c = cafe.trim();
    if (!p || !c) {
      Alert.alert("Missing", "Pattern and café are both required.");
      return;
    }
    setBusy(true);
    try {
      const { data: created } = await api.post("/admin/cafe-rules", { pattern: p, cafe: c });
      onCreated(created);
      setPattern(""); setCafe("");
    } catch (e) {
      Alert.alert("Create failed", formatDetail(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.row, s.rowNew]} testID="cafe-rule-new">
      <Text style={s.newLabel}>ADD RULE</Text>
      <TextInput
        value={pattern}
        onChangeText={setPattern}
        placeholder="Ride name or neighbourhood (e.g. julie andrews)"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={s.input}
      />
      <TextInput
        value={cafe}
        onChangeText={setCafe}
        placeholder="Café · Street, Suburb"
        placeholderTextColor={colors.textMuted}
        style={s.input}
      />
      <TouchableOpacity onPress={submit} disabled={busy || !pattern.trim() || !cafe.trim()} style={[s.addBtn, (busy || !pattern.trim() || !cafe.trim()) && s.addBtnDisabled]} testID="cafe-rule-new-submit">
        {busy ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.addBtnTxt}>＋ ADD RULE</Text>}
      </TouchableOpacity>
    </View>
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
      const { data } = await api.get("/admin/cafe-rules");
      setRules(data.rules || []);
    } catch (e) {
      Alert.alert("Load failed", formatDetail(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && rules.length === 0 && !loading) load();
  }, [open, rules.length, loading, load]);

  const onCreated = (rule) => setRules((prev) => [...prev, rule]);
  const onSaved = (rule) => setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
  const onDeleted = (id) => setRules((prev) => prev.filter((r) => r.id !== id));

  const visible = filter.trim()
    ? rules.filter((r) => r.pattern.toLowerCase().includes(filter.toLowerCase()) || r.cafe.toLowerCase().includes(filter.toLowerCase()))
    : rules;

  return (
    <View style={s.block} testID="cafe-rules-admin">
      <TouchableOpacity onPress={() => setOpen((v) => !v)} style={s.header} testID="cafe-rules-toggle">
        <Text style={s.eyebrow}>☕ CAFÉ RULES{rules.length > 0 ? ` · ${rules.length}` : ""}</Text>
        <Text style={s.chevron}>{open ? "−" : "+"}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter rules…"
            placeholderTextColor={colors.textMuted}
            style={s.input}
          />
          <NewRuleRow onCreated={onCreated} />
          {loading && rules.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.brandAccent} />
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {visible.map((r) => (
                <RuleRow key={r.id} rule={r} onSaved={onSaved} onDeleted={onDeleted} />
              ))}
              {visible.length === 0 && rules.length > 0 && (
                <Text style={s.emptyMsg}>No rules match "{filter}".</Text>
              )}
              {rules.length === 0 && !loading && (
                <Text style={s.emptyMsg}>No rules yet — add the first one above.</Text>
              )}
            </View>
          )}
          <Text style={s.footer}>First keyword match wins. Rides not matching any rule fall back to their hand-set café.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: colors.bgSecondary, borderColor: "rgba(212,255,0,0.15)", borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  chevron: { color: colors.textSecondary, fontSize: 20, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgPrimary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  rowEditing: { flexDirection: "column", alignItems: "stretch", borderColor: "rgba(212,255,0,0.30)", borderWidth: 1 },
  rowNew: { flexDirection: "column", alignItems: "stretch", borderStyle: "dashed", borderColor: "rgba(212,255,0,0.35)", borderWidth: 1 },
  newLabel: { color: colors.brandAccent, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  rowPattern: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  rowCafe: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  iconBtn: { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.bgSecondary, borderRadius: 6 },
  iconBtnTxt: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  iconBtnDelete: {},
  iconBtnDeleteTxt: { color: "#ef4444", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  input: { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  saveBtn: { flex: 1, backgroundColor: colors.brandAccent, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  saveBtnTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  cancelBtn: { flex: 1, borderColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  cancelBtnTxt: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  addBtn: { backgroundColor: colors.brandAccent, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  addBtnDisabled: { opacity: 0.4 },
  addBtnTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  emptyMsg: { color: colors.textMuted, fontSize: 11, textAlign: "center", paddingVertical: 8 },
  footer: { color: colors.textMuted, fontSize: 10, fontStyle: "italic", lineHeight: 14, marginTop: 4 },
});
