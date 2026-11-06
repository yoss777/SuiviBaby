import type { OwnershipBlocker } from "@/services/accountDeletionService";
import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface OwnershipTransferModalProps {
  visible: boolean;
  blockers: OwnershipBlocker[];
  /** childId -> chosen new owner uid */
  choices: Record<string, string>;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  onSelect: (childId: string, uid: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  contributor: "Contributeur",
  viewer: "Lecteur",
};

export function OwnershipTransferModal({
  visible,
  blockers,
  choices,
  backgroundColor,
  textColor,
  mutedColor,
  borderColor,
  accentColor,
  onSelect,
  onConfirm,
  onCancel,
}: OwnershipTransferModalProps) {
  const allChosen =
    blockers.length > 0 && blockers.every((b) => !!choices[b.childId]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor }]}>
          <Text
            style={[styles.title, { color: textColor }]}
            accessibilityRole="header"
          >
            Qui reprend le suivi ?
          </Text>
          <Text style={[styles.intro, { color: mutedColor }]}>
            Vous êtes le seul responsable de {blockers.length > 1 ? "ces enfants" : "cet enfant"}.
            Choisissez la personne qui deviendra propriétaire : elle gardera
            l&apos;accès au suivi, vos saisies resteront visibles pour elle
            (anonymisées) et vous quitterez le partage.
          </Text>

          <ScrollView style={styles.list}>
            {blockers.map((blocker) => (
              <View key={blocker.childId} style={styles.group}>
                <Text style={[styles.childName, { color: textColor }]}>
                  {blocker.childName}
                </Text>
                {blocker.members.map((member) => {
                  const selected = choices[blocker.childId] === member.uid;
                  const label = member.displayName?.trim() || "Membre";
                  const role = ROLE_LABELS[member.role] ?? "Membre";
                  return (
                    <TouchableOpacity
                      key={member.uid}
                      style={[
                        styles.option,
                        {
                          borderColor: selected ? accentColor : borderColor,
                        },
                      ]}
                      onPress={() => onSelect(blocker.childId, member.uid)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${label}, ${role}, nouveau propriétaire de ${blocker.childName}`}
                    >
                      <View
                        style={[
                          styles.radio,
                          { borderColor: selected ? accentColor : mutedColor },
                        ]}
                      >
                        {selected && (
                          <View
                            style={[styles.radioDot, { backgroundColor: accentColor }]}
                          />
                        )}
                      </View>
                      <View style={styles.optionText}>
                        <Text style={[styles.optionLabel, { color: textColor }]}>
                          {label}
                        </Text>
                        <Text style={[styles.optionRole, { color: mutedColor }]}>
                          {role}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: borderColor }]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Annuler"
            >
              <Text style={[styles.buttonText, { color: textColor }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: accentColor },
                !allChosen && styles.disabled,
              ]}
              onPress={onConfirm}
              disabled={!allChosen}
              accessibilityRole="button"
              accessibilityLabel="Transférer la propriété et continuer"
              accessibilityState={{ disabled: !allChosen }}
            >
              <Text style={[styles.buttonText, { color: "#fff" }]}>Continuer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  content: { width: "100%", maxWidth: 420, maxHeight: "85%", borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  list: { flexGrow: 0 },
  group: { marginBottom: 12, gap: 8 },
  childName: { fontSize: 15, fontWeight: "700" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: "600" },
  optionRole: { fontSize: 12 },
  buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  buttonText: { fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
