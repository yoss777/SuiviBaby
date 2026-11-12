import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import {
  ALLERGY_SUGGESTIONS,
  MAX_ALLERGIES,
  MAX_ALLERGY_LENGTH,
  addAllergy,
  hasAllergy,
  removeAllergy,
} from "@/utils/childAllergies";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  colorScheme: "light" | "dark";
  /** Proche (lecture seule) : aucune modification possible. */
  readOnly?: boolean;
  /** Envoi en cours : champs verrouillés temporairement. */
  disabled?: boolean;
}

const ERRORS = {
  duplicate: "Cette allergie est déjà dans la liste.",
  limit: `Maximum ${MAX_ALLERGIES} allergies.`,
  empty: "Saisissez le nom de l'allergie.",
} as const;

/** Éditeur des « Allergies connues » : suggestions cochables + saisie libre. */
export function AllergiesEditor({ value, onChange, colorScheme, readOnly, disabled }: Props) {
  const nc = getNeutralColors(colorScheme);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const locked = !!readOnly || !!disabled;

  if (readOnly) {
    const text = value.length ? value.join(", ") : "Aucune renseignée";
    return (
      <View>
        <Text style={[styles.title, { color: nc.textStrong }]}>Allergies connues</Text>
        <Text style={[styles.hint, { color: nc.textLight }]}>{text}</Text>
      </View>
    );
  }

  const toggleSuggestion = (label: string) => {
    setError(null);
    if (hasAllergy(value, label)) return onChange(removeAllergy(value, label));
    const res = addAllergy(value, label);
    if (res.ok) onChange(res.list);
    else setError(ERRORS[res.reason]);
  };

  const submitDraft = () => {
    const res = addAllergy(value, draft);
    if (res.ok) {
      onChange(res.list);
      setDraft("");
      setError(null);
    } else {
      setError(ERRORS[res.reason]);
    }
  };

  const custom = value.filter(
    (a) => !ALLERGY_SUGGESTIONS.some((s) => hasAllergy([s.label], a)),
  );

  return (
    <View>
      <Text style={[styles.title, { color: nc.textStrong }]}>Allergies connues</Text>
      <Text style={[styles.hint, { color: nc.textLight }]}>
        Facultatif. Ces informations de santé restent privées.
      </Text>
      <View style={styles.row}>
        {ALLERGY_SUGGESTIONS.map((s) => {
          const checked = hasAllergy(value, s.label);
          return (
            <TouchableOpacity
              key={s.label}
              style={[
                styles.chip,
                {
                  borderColor: checked ? nc.todayAccent : nc.border,
                  backgroundColor: checked ? nc.todayAccent + "20" : nc.backgroundPressed,
                },
                locked && styles.disabled,
              ]}
              onPress={() => toggleSuggestion(s.label)}
              disabled={locked}
              accessibilityRole="checkbox"
              accessibilityLabel={s.label}
              accessibilityState={{ checked, disabled: locked }}
            >
              <Text style={styles.emoji}>{s.emoji}</Text>
              <Text style={[styles.chipText, { color: nc.textStrong }]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {custom.length > 0 && (
        <View style={styles.row}>
          {custom.map((a) => (
            <TouchableOpacity
              key={a}
              style={[
                styles.chip,
                { borderColor: nc.todayAccent, backgroundColor: nc.todayAccent + "20" },
                locked && styles.disabled,
              ]}
              onPress={() => onChange(removeAllergy(value, a))}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${a}`}
            >
              <Text style={[styles.chipText, { color: nc.textStrong }]}>{a}  ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            { color: nc.textStrong, borderColor: nc.border, backgroundColor: nc.backgroundCard },
          ]}
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            setError(null);
          }}
          placeholder="Autre allergie"
          placeholderTextColor={nc.textMuted}
          maxLength={MAX_ALLERGY_LENGTH}
          editable={!locked}
          onSubmitEditing={submitDraft}
          returnKeyType="done"
          accessibilityLabel="Autre allergie"
        />
        <TouchableOpacity
          style={[
            styles.addButton,
            { backgroundColor: nc.todayAccent },
            (locked || !draft.trim()) && styles.disabled,
          ]}
          onPress={submitDraft}
          disabled={locked || !draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Ajouter l'allergie"
          accessibilityState={{ disabled: locked || !draft.trim() }}
        >
          <Text style={[styles.addText, { color: nc.onTodayAccent }]}>Ajouter</Text>
        </TouchableOpacity>
      </View>
      {error && (
        <Text style={[styles.error, { color: nc.errorText }]} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 14, fontWeight: "500" },
  emoji: { fontSize: 16 },
  disabled: { opacity: 0.5 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  addButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { fontSize: 14, fontWeight: "700" },
  error: { fontSize: 13, marginTop: 6 },
});
