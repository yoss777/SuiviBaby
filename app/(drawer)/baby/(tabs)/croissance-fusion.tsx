// app/(drawer)/baby/(tabs)/croissance-fusion.tsx
// APERÇU TEMPORAIRE (décision produit en attente) : montre l'idée de fusion
// des deux écrans Croissance. L'onglet Croissance contient déjà la courbe OMS
// et la liste des mesures ; Plus > Croissance contient la même liste avec des
// outils en plus. L'écran fusionné = l'onglet, enrichi de ces outils, et
// Plus > Croissance ouvre directement l'onglet. À supprimer après décision.
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { SHOW_PREVIEWS } from "@/constants/featureFlags";
import { Redirect, router, useFocusEffect, useIsFocused } from "expo-router";
import { lazy, Suspense, useCallback, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";

// Chargé à la demande et monté seulement quand l'aperçu est à l'écran : pas
// de second CroissanceScreen (écouteurs Firestore, graphique) en arrière-plan
// à côté de l'onglet Croissance.
const CroissanceScreen = lazy(() => import("./croissance"));

const MERGED_TOOLS = [
  "Filtre par période (7 jours, 30 jours, choisir une date)",
  "Sélection multiple pour supprimer plusieurs mesures",
  "Chargement des mesures plus anciennes par pages",
  "Plus > Croissance ouvre directement cet écran",
];

export default function CroissanceFusionPreview() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const [open, setOpen] = useState(true);
  const isFocused = useIsFocused();

  // Hidden tab: Android back would go to Home, come back to Plus instead.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.replace("/baby/plus");
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  // Aperçu interne : jamais dans un build de store (lien profond compris).
  if (!SHOW_PREVIEWS) return <Redirect href="/baby/croissance" />;

  return (
    <View style={{ flex: 1, backgroundColor: nc.background }}>
      <View style={[styles.banner, { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight }]}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={styles.bannerHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="Aperçu de l'écran Croissance fusionné"
        >
          <FontAwesome name="flask" size={14} color={nc.textStrong} />
          <Text style={[styles.bannerTitle, { color: nc.textStrong }]}>
            Aperçu : un seul écran Croissance
          </Text>
          <FontAwesome name={open ? "chevron-up" : "chevron-down"} size={12} color={nc.textLight} />
        </Pressable>
        {open && (
          <>
            <Text style={[styles.bannerText, { color: nc.textNormal }]}>
              En dessous, la courbe OMS et la liste des mesures (l&apos;onglet actuel). La version
              fusionnée y ajouterait les outils du sous-écran de Plus :
            </Text>
            {MERGED_TOOLS.map((t) => (
              <Text key={t} style={[styles.bullet, { color: nc.textNormal }]}>
                • {t}
              </Text>
            ))}
            <Pressable
              onPress={() => router.replace("/baby/growth?returnTo=plus")}
              style={styles.link}
              accessibilityRole="link"
            >
              <Text style={[styles.linkText, { color: nc.todayAccent }]}>
                Comparer avec l&apos;écran actuel de Plus
              </Text>
            </Pressable>
          </>
        )}
      </View>
      <View style={{ flex: 1 }}>
        {isFocused ? (
          <Suspense fallback={null}>
            <CroissanceScreen />
          </Suspense>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { margin: 12, marginBottom: 4, padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
  bannerHeader: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  bannerTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  bannerText: { fontSize: 13, lineHeight: 18 },
  bullet: { fontSize: 13, lineHeight: 18, paddingLeft: 4 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { fontSize: 14, fontWeight: "600" },
});
