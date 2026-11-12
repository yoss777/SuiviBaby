import {
  DELETE_CHILD_CHOICE,
  LOW_PRIVILEGE_ROLES,
  type OwnershipBlocker,
} from "@/services/accountDeletionService";
import { getReadableTextColor } from "@/constants/theme";
import React, { useEffect, useState } from "react";
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
  /** childId -> chosen new owner uid, or DELETE_CHILD_CHOICE (default when absent) */
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
  admin: "Parent",
  contributor: "Proche",
  viewer: "Observateur",
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
  const [confirmingRisky, setConfirmingRisky] = useState(false);
  const choiceOf = (childId: string) => choices[childId] ?? DELETE_CHILD_CHOICE;

  useEffect(() => {
    if (!visible) setConfirmingRisky(false);
  }, [visible]);

  // Contributors / viewers picked as owner: they get full rights.
  const riskyPicks = blockers.flatMap((b) => {
    const member = b.members.find((m) => m.uid === choiceOf(b.childId));
    return member && LOW_PRIVILEGE_ROLES.includes(member.role)
      ? [{ childName: b.childName, member }]
      : [];
  });
  const hasDeletion = blockers.some(
    (b) => choiceOf(b.childId) === DELETE_CHILD_CHOICE,
  );
  const allChosen = blockers.length > 0;

  const handleContinue = () => {
    if (riskyPicks.length > 0) {
      setConfirmingRisky(true);
      return;
    }
    onConfirm();
  };

  if (confirmingRisky) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setConfirmingRisky(false)}>
        <View style={styles.overlay}>
          <View style={[styles.content, { backgroundColor }]}>
            <Text style={[styles.title, { color: textColor }]} accessibilityRole="header">
              Confirmer le transfert
            </Text>
            <ScrollView style={styles.list}>
              {riskyPicks.map(({ childName, member }) => (
                <Text key={`${childName}-${member.uid}`} style={[styles.intro, { color: textColor }]}>
                  {member.displayName?.trim() || "Ce membre"} (
                  {ROLE_LABELS[member.role] ?? "Membre"}) deviendra propriétaire
                  du suivi de {childName}.
                </Text>
              ))}
              <Text style={[styles.intro, { color: mutedColor }]}>
                Attention : un propriétaire dispose de tous les droits. Il pourra
                gérer les accès (inviter ou retirer des personnes) et verra
                toutes les données de santé de l&apos;enfant. Vérifiez que vous
                lui faites entièrement confiance.
              </Text>
            </ScrollView>
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: borderColor }]}
                onPress={() => setConfirmingRisky(false)}
                accessibilityRole="button"
                accessibilityLabel="Revenir au choix"
              >
                <Text style={[styles.buttonText, { color: textColor }]}>Revenir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: accentColor }]}
                onPress={() => {
                  setConfirmingRisky(false);
                  onConfirm();
                }}
                accessibilityRole="button"
                accessibilityLabel="Je confirme le transfert de tous les droits"
              >
                <Text style={[styles.buttonText, { color: getReadableTextColor(accentColor) }]}>Je confirme</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

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
            Pour chacun, supprimez le suivi ou choisissez la personne qui
            deviendra propriétaire : elle gardera l&apos;accès au suivi, vos
            saisies resteront visibles pour elle (anonymisées) et vous quitterez
            le partage.
          </Text>

          <ScrollView style={styles.list}>
            {blockers.map((blocker) => (
              <View key={blocker.childId} style={styles.group}>
                <Text style={[styles.childName, { color: textColor }]}>
                  {blocker.childName}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.option,
                    {
                      borderColor:
                        choiceOf(blocker.childId) === DELETE_CHILD_CHOICE
                          ? accentColor
                          : borderColor,
                    },
                  ]}
                  onPress={() => onSelect(blocker.childId, DELETE_CHILD_CHOICE)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: choiceOf(blocker.childId) === DELETE_CHILD_CHOICE,
                  }}
                  accessibilityLabel={`Supprimer le suivi de ${blocker.childName}`}
                >
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor:
                          choiceOf(blocker.childId) === DELETE_CHILD_CHOICE
                            ? accentColor
                            : mutedColor,
                      },
                    ]}
                  >
                    {choiceOf(blocker.childId) === DELETE_CHILD_CHOICE && (
                      <View style={[styles.radioDot, { backgroundColor: accentColor }]} />
                    )}
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, { color: textColor }]}>
                      Supprimer le suivi de cet enfant
                    </Text>
                    <Text style={[styles.optionRole, { color: mutedColor }]}>
                      Suppression après 30 jours, annulable pendant ce délai.
                      Les autres membres perdent l&apos;accès.
                    </Text>
                  </View>
                </TouchableOpacity>
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
              onPress={handleContinue}
              disabled={!allChosen}
              accessibilityRole="button"
              accessibilityLabel={
                hasDeletion
                  ? "Continuer avec les choix sélectionnés"
                  : "Transférer la propriété et continuer"
              }
              accessibilityState={{ disabled: !allChosen }}
            >
              <Text style={[styles.buttonText, { color: getReadableTextColor(accentColor) }]}>Continuer</Text>
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
