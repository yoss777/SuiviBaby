import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function PrivacyScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<number, number>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopOpacity = useRef(new Animated.Value(0)).current;

const sections = [
    {
      title: "1. Responsable du traitement",
      content:
        "Le service SuiviBaby est opéré par [Votre Nom ou Nom de l'entreprise], situé à [Votre Adresse complète]. Pour toute question relative à la protection de vos données, vous pouvez nous contacter à l'adresse : privacy@suivibaby.com.",
    },
    {
      title: "2. Nature des données collectées",
      content:
        "Compte : Adresse email, pseudonyme. Données de l'enfant (catégories particulières de données) : Prénom, date de naissance, sexe, et journal de bord de l'enfant (alimentation, sommeil, hygiène, santé, mesures de croissance). Ces données sont traitées uniquement pour vous fournir les fonctionnalités de suivi de l'application.",
    },
    {
      title: "3. Base légale et Consentement aux données de santé",
      content:
        "Le traitement des données de suivi de l'enfant (données de santé) repose sur votre consentement explicite, conformément à l'Article 9.2.a du RGPD. En saisissant ces informations dans l'application, vous consentez activement à leur traitement par SuiviBaby. Vous pouvez retirer ce consentement à tout moment en supprimant les données concernées ou en clôturant votre compte.",
    },
    {
      title: "4. Hébergement et Transferts de données",
      content:
        "Vos données sont hébergées par Google Firebase sur des serveurs sécurisés situés dans la région us-central1 (Etats-Unis). Tout transfert éventuel hors UE est encadré par les Clauses Contractuelles Types (CCT) de la Commission Europeenne pour garantir un niveau de protection equivalent.",
    },
    {
      title: "5. Conservation et Suppression des données",
      content:
        "Les données sont conservées tant que votre compte est actif. En cas de demande de suppression par l'utilisateur, les données sont immédiatement effacées de nos bases de production. Pour des raisons de sécurité et de continuité de service, leur effacement définitif de nos copies de sauvegarde (backups) peut toutefois prendre jusqu'à 60 jours. Après 2 ans d'inactivité totale, votre compte et ses données associées seront automatiquement supprimés.",
    },
    {
      title: "6. Sécurité et Destinataires",
      content:
        "Nous ne vendons, n'échangeons ni ne louons vos données personnelles. Elles sont chiffrées en transit (protocole TLS) et au repos (chiffrement AES-256). Seuls les services techniques de notre sous-traitant Google Firebase et les personnes que vous autorisez explicitement via les fonctions de partage de l'application ont accès aux données.",
    },
    {
      title: "7. Vos droits (RGPD)",
      content:
        "Conformément à la réglementation, vous disposez des droits d'accès, de rectification, de suppression, de portabilité et de limitation du traitement de vos données. Pour exercer ces droits, contactez-nous à privacy@suivibaby.com. Vous avez également le droit d'introduire une réclamation auprès de la CNIL (www.cnil.fr).",
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: nc.background },
        ]}
        edges={["bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Confidentialité",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={useCallback((e: any) => {
            const y = e.nativeEvent.contentOffset.y;
            const shouldShow = y > 300;
            if (shouldShow !== showScrollTop) {
              setShowScrollTop(shouldShow);
              Animated.timing(scrollTopOpacity, {
                toValue: shouldShow ? 1 : 0,
                duration: 200,
                useNativeDriver: true,
              }).start();
            }
          }, [showScrollTop, scrollTopOpacity])}
          scrollEventThrottle={100}
        >
          <View style={[styles.header, { backgroundColor: nc.backgroundCard }]} accessibilityRole="header">
            <View
              style={[
                styles.headerIcon,
                { backgroundColor: getBackgroundTint(Colors[colorScheme].tint, 0.12) },
              ]}
            >
              <Ionicons
                name="shield-checkmark"
                size={32}
                color={Colors[colorScheme].tint}
              />
            </View>
            <ThemedText style={styles.headerTitle}>
              Politique de confidentialité
            </ThemedText>
            <Text
              style={[
                styles.headerDate,
                { color: nc.textMuted },
              ]}
            >
              Dernière mise à jour : 1er janvier 2026
            </Text>
          </View>

          {/* Sommaire cliquable */}
          <View style={[styles.tocContainer, { backgroundColor: nc.backgroundCard }]}>
            <ThemedText style={styles.tocTitle}>Sommaire</ThemedText>
            {sections.map((section, index) => (
              <TouchableOpacity
                key={`toc-${index}`}
                style={styles.tocItem}
                onPress={() => {
                  const y = sectionRefs.current[index];
                  if (y !== undefined) {
                    scrollViewRef.current?.scrollTo({ y, animated: true });
                  }
                }}
                accessibilityRole="link"
                accessibilityLabel={section.title}
              >
                <Text style={[styles.tocText, { color: Colors[colorScheme].tint }]}>
                  {section.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.content, { backgroundColor: nc.backgroundCard }]}>
            <ThemedText style={styles.intro}>
              Chez SuiviBaby, la protection de vos donnees personnelles est
              notre priorite absolue. Cette politique explique comment nous
              collectons, utilisons et protegeons vos informations.
            </ThemedText>

            {sections.map((section, index) => (
              <View
                key={index}
                style={styles.section}
                accessibilityRole="header"
                onLayout={(e) => {
                  sectionRefs.current[index] = e.nativeEvent.layout.y;
                }}
              >
                <ThemedText style={styles.sectionTitle}>
                  {section.title}
                </ThemedText>
                <Text
                  style={[
                    styles.sectionContent,
                    { color: nc.textLight },
                  ]}
                >
                  {section.content}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.footer, { backgroundColor: nc.backgroundCard }]}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.footerText}>
              Pour toute question : privacy@suivibaby.com
            </ThemedText>
          </View>
        </ScrollView>

        {/* Bouton retour en haut */}
        <Animated.View style={[styles.scrollTopButton, { opacity: scrollTopOpacity }]} pointerEvents={showScrollTop ? "auto" : "none"}>
          <TouchableOpacity
            style={[styles.scrollTopTouchable, { backgroundColor: nc.todayAccent }]}
            onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
            accessibilityRole="button"
            accessibilityLabel="Retour en haut"
          >
            <Ionicons name="chevron-up" size={24} color={nc.white} />
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: "center",
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  headerDate: {
    fontSize: 14,
  },
  content: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  footerText: {
    fontSize: 14,
  },
  tocContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  tocTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  tocItem: {
    paddingVertical: 6,
  },
  tocText: {
    fontSize: 14,
    fontWeight: "500",
  },
  scrollTopButton: {
    position: "absolute",
    bottom: 24,
    right: 16,
  },
  scrollTopTouchable: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
