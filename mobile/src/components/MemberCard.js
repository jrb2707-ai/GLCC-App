import React, { useState } from "react";
import { View, Text, Image, Modal, TouchableOpacity, StyleSheet, ScrollView, Alert, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../constants/theme";
import { pad4 } from "../lib/util";
import { api, formatDetail } from "../lib/api";

export default function MemberCard({ rider, onClose, onEditProfile, isBlocked, canBlock, onBlockChange }) {
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  if (!rider) return null;
  const initials = (rider.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const firstName = (rider.name || "").trim().split(/\s+/)[0] || "";
  const shortLast = (rider.name || "").trim().split(/\s+/).slice(-1)[0]?.[0] || "";
  const displayName = `${firstName.toUpperCase()} ${shortLast.toUpperCase()}.`;
  const memberNo = rider.member_no != null ? pad4(rider.member_no) : "—";
  const joinedSource = rider.member_since || rider.created_at;
  const joinedLabel = joinedSource
    ? new Date(joinedSource).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";

  const cardWidth = Math.min(280, width * 0.72);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        {/* Watermark */}
        <View pointerEvents="none" style={s.watermarkWrap}>
          <Text style={[s.watermark, { fontSize: width * 0.72 }]}>GLCC</Text>
        </View>

        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="member-card-close">
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>×</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>MEMBER CARD</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <View style={[s.card, { width: cardWidth, height: cardWidth * 1.46, transform: [{ rotate: "-3deg" }] }]} testID="member-card">
              <Text style={s.cardEyebrow}>GLCC ·</Text>
              <Text style={s.cardName}>{displayName}</Text>
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                {rider.photo ? (
                  <Image source={{ uri: rider.photo }} style={s.cardPhoto} />
                ) : (
                  <View style={s.cardPhotoFallback}>
                    <Text style={s.cardInitials}>{initials}</Text>
                  </View>
                )}
              </View>
              <View style={s.cardFooter}>
                <View>
                  <Text style={s.cardFooterLabel}>Member</Text>
                  <Text style={s.cardFooterValue} testID="member-card-number">#{memberNo}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.cardFooterLabel}>Chapter</Text>
                  <Text style={s.cardFooterChapter}>Grey Lynn</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.metaGrid}>
            <MetaCell label="Member No." value={`#${memberNo}`} big />
            <MetaCell label="Role" value={rider.is_president ? "El Presidente" : rider.role || "Member"} />
            <MetaCell label="Since" value={joinedLabel} />
            <MetaCell label="Chapter" value="Grey Lynn" />
            <MetaCell label="Coffee" value={rider.coffee || "—"} full />
            {onEditProfile && (
              <TouchableOpacity onPress={onEditProfile} style={s.editBtn} testID="member-card-edit">
                <Text style={s.editBtnTxt}>EDIT PROFILE</Text>
              </TouchableOpacity>
            )}
            {canBlock && (
              <TouchableOpacity
                disabled={busy}
                onPress={async () => {
                  if (isBlocked) {
                    setBusy(true);
                    try {
                      await api.delete(`/blocks/${rider.id}`);
                      await onBlockChange?.();
                    } catch (e) { Alert.alert("Block", formatDetail(e)); }
                    finally { setBusy(false); }
                  } else {
                    Alert.alert(
                      "Block this rider?",
                      "You won't see their chat messages and they can't @mention you. You can unblock any time.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Block", style: "destructive",
                          onPress: async () => {
                            setBusy(true);
                            try {
                              await api.post("/blocks", { target_id: rider.id });
                              await onBlockChange?.();
                              onClose?.();
                            } catch (e) { Alert.alert("Block", formatDetail(e)); }
                            finally { setBusy(false); }
                          },
                        },
                      ]
                    );
                  }
                }}
                style={[s.blockBtn, isBlocked && s.blockBtnActive]}
                testID={isBlocked ? "member-card-unblock" : "member-card-block"}
              >
                <Text style={[s.blockBtnTxt, isBlocked && { color: "#fff" }]}>
                  {isBlocked ? "✓ BLOCKED · TAP TO UNBLOCK" : "🚫 BLOCK THIS RIDER"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function MetaCell({ label, value, big, full }) {
  return (
    <View style={[s.metaCell, full && { width: "100%" }]}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={[s.metaValue, big && { fontSize: 22 }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e1310" },
  watermarkWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  watermark: { color: "rgba(255,255,255,0.035)", fontWeight: "900", letterSpacing: -6 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" },
  topTitle: { color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: 4, fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  cardEyebrow: { fontSize: 10, letterSpacing: 4, fontWeight: "700", color: "rgba(0,0,0,0.5)" },
  cardName: { fontSize: 26, fontWeight: "900", letterSpacing: -1, marginTop: 4, color: "#000" },
  cardPhoto: { width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: "#000" },
  cardPhotoFallback: { width: 112, height: 112, borderRadius: 56, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  cardInitials: { color: "#fff", fontWeight: "900", fontSize: 32 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cardFooterLabel: { fontSize: 9, letterSpacing: 3, fontWeight: "700", color: "rgba(0,0,0,0.5)" },
  cardFooterValue: { fontSize: 20, fontWeight: "900", color: "#000", marginTop: 2 },
  cardFooterChapter: { fontSize: 13, fontWeight: "900", color: "#000", marginTop: 2, letterSpacing: -0.3 },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 12 },
  metaCell: { width: "47%", borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", padding: 12 },
  metaLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  metaValue: { color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 4, textTransform: "uppercase" },

  editBtn: { width: "100%", backgroundColor: colors.accentVolt, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  editBtnTxt: { color: "#000", fontWeight: "900", letterSpacing: 3, fontSize: 12 },
  blockBtn: { width: "100%", borderWidth: 1, borderColor: "rgba(239,68,68,0.40)", backgroundColor: "rgba(239,68,68,0.15)", borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  blockBtnActive: { backgroundColor: colors.statusCant, borderColor: colors.statusCant },
  blockBtnTxt: { color: colors.statusCant, fontWeight: "900", letterSpacing: 3, fontSize: 12 },
});
