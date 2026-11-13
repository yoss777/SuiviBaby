// app/settings/widget.tsx
// Aide « Ajouter le widget » : comment poser le widget « Bébé maintenant »,
// ce qu'il montre et ce qu'on peut toucher. Seul endroit où ce que Premium
// ajoute au widget est mentionné (jamais dans le widget lui-même).
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type Step = { icon: keyof typeof Ionicons.glyphMap; text: string };

const ADD_STEPS: Step[] =
  Platform.OS === "ios"
    ? [
        { icon: "hand-left-outline", text: "Appuyez longuement sur un espace vide de l'écran d'accueil." },
        { icon: "add-circle-outline", text: "Touchez « + » en haut de l'écran." },
        { icon: "search-outline", text: "Cherchez « SuiviBaby », choisissez la taille, puis « Ajouter le widget »." },
      ]
    : [
        { icon: "hand-left-outline", text: "Appuyez longuement sur un espace vide de l'écran d'accueil." },
        { icon: "grid-outline", text: "Touchez « Widgets »." },
        { icon: "search-outline", text: "Cherchez « SuiviBaby » et faites glisser « Bébé maintenant » sur l'écran." },
      ];

const SHOWS: Step[] = [
  { icon: "timer-outline", text: "Les sessions en cours (tétée, sieste ou nuit, promenade), avec un chrono qui avance tout seul." },
  { icon: "time-outline", text: "Au repos : depuis combien de temps bébé a mangé et a été changé." },
  { icon: "list-outline", text: "La journée : repas, changes, sommeil, et le fil des derniers événements." },
  { icon: "people-outline", text: "Le bébé affiché est celui choisi dans l'app." },
];

const TOUCH: Step[] = [
  { icon: "restaurant-outline", text: "Repas : ouvre directement la saisie d'un repas." },
  { icon: "water-outline", text: "Change : ouvre directement la saisie d'un change." },
  { icon: "heart-outline", text: "Tétée en cours : la reprend dans l'app." },
  { icon: "phone-portrait-outline", text: "Ailleurs : ouvre SuiviBaby." },
];

const PRIVACY: Step[] = [
  { icon: "log-out-outline", text: "À la déconnexion, le widget est vidé : le prénom et les données de bébé n'y restent pas." },
  { icon: "refresh-outline", text: "Si une information date de plus de 2 heures, le widget l'indique (« màj 14:02 »)." },
  { icon: "notifications-outline", text: "Les rappels discrets (repas pour tous, change avec Premium) suivent vos réglages de rappels." },
];

export default function WidgetHelpScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;

  const section = (title: string, steps: Step[], numbered = false) => (
    <View style={[styles.section, { backgroundColor: nc.backgroundCard }]} accessibilityRole="summary">
      <ThemedText style={[styles.sectionTitle, { color: tint }]} accessibilityRole="header">
        {title}
      </ThemedText>
      {steps.map((step, index) => (
        <View key={step.text} style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: nc.background }]}>
            <Ionicons name={step.icon} size={20} color={tint} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
          <ThemedText style={styles.rowText}>{numbered ? `${index + 1}. ${step.text}` : step.text}</ThemedText>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={[styles.screen, { backgroundColor: nc.background }]} edges={["bottom"]}>
        <Stack.Screen options={{ title: "Widget", headerBackTitle: "Retour" }} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {section("Ajouter le widget", ADD_STEPS, true)}
          {section("Ce qu'il montre", SHOWS)}
          {section("Ce qu'on peut toucher", TOUCH)}
          {section("Vos données", PRIVACY)}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { padding: 16 },
  section: { marginBottom: 20, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontSize: 15, lineHeight: 21 },
});
