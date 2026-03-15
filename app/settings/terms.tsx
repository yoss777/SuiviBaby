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

export default function TermsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<number, number>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopOpacity = useRef(new Animated.Value(0)).current;

  const sections = [
    {
      title: '1. Qui fournit le service',
      content:
        'Le service est propose par SuiviBaby, [adresse complete], [pays]. Contact : support@suivibaby.com.',
    },
{
      title: '2. Avertissement médical important',
      content:
        'SuiviBaby est un outil d\'organisation personnelle. Il ne constitue pas un dispositif médical, ne fournit aucun diagnostic et ne remplace jamais l\'avis, l\'examen ou la prescription d\'un pédiatre ou d\'un professionnel de santé qualifié.',
    },
    {
      title: '3. Responsabilité de l\'utilisateur',
      content:
        'Vous certifiez être le tuteur légal de l\'enfant pour lequel vous créez un profil. Vous êtes responsable de l\'exactitude des données saisies et de la confidentialité de vos identifiants d\'accès.',
    },
    {
      title: '4. Utilisation appropriee',
      content:
        'Vous vous engagez a utiliser l\'application conformement aux lois en vigueur, ne pas detourner le service a des fins frauduleuses et fournir des informations exactes.',
    },
    {
      title: '5. Donnees et sauvegarde',
      content:
        "Vos donnees sont enregistrees dans le cloud pour assurer leur synchronisation, dans la region us-central1. Des fonctionnalites d'export peuvent etre proposees, mais vous restez responsable de vos sauvegardes personnelles.",
    },
    {
      title: '6. Propriete intellectuelle',
      content:
        'Le contenu, les marques, le design et le code de l\'application sont la propriete de SuiviBaby ou de ses partenaires.',
    },
    {
      title: '7. Disponibilite du service',
      content:
        'Nous nous efforcons de maintenir le service disponible, mais ne garantissons pas une disponibilite continue (maintenance, incidents, dependances techniques).',
    },
{
      title: '8. Suppression du compte',
      content:
        'L\'utilisateur peut supprimer son compte via les paramètres de l\'application. Cette action est irréversible et entraîne la suppression immédiate de toutes les données de suivi associées.',
    },
    {
      title: '9. Limitation de responsabilité',
      content:
        'SuiviBaby décline toute responsabilité en cas de perte de données ou d\'interprétation erronée des graphiques de suivi par l\'utilisateur. Le service est fourni "en l\'état".',
    },
    {
      title: '10. Modifications',
      content:
        'Nous pouvons modifier ces conditions. En cas de changement important, vous serez informe via l\'application ou par email.',
    },
    {
      title: '11. Droit applicable',
      content:
        'Ces conditions sont regies par le droit francais. Tout litige releve de la competence des tribunaux de Paris.',
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={[styles.container, { backgroundColor: nc.background }]} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: 'Conditions d\'utilisation',
            headerBackTitle: 'Retour',
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
            <View style={[styles.headerIcon, { backgroundColor: getBackgroundTint(Colors[colorScheme].tint, 0.12) }]}>
              <Ionicons name="document-text" size={32} color={Colors[colorScheme].tint} />
            </View>
            <ThemedText style={styles.headerTitle}>
              Conditions d'utilisation
            </ThemedText>
            <Text style={[styles.headerDate, { color: nc.textMuted }]}>
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
              Bienvenue sur SuiviBaby. Ces conditions d'utilisation regissent votre accès et
              utilisation de notre application. Veuillez les lire attentivement.
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
                <Text style={[styles.sectionContent, { color: nc.textLight }]}>
                  {section.content}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.footer, { backgroundColor: nc.backgroundCard }]}>
            <Ionicons name="information-circle" size={20} color={Colors[colorScheme].tint} />
            <ThemedText style={styles.footerText}>
              Pour toute question : support@suivibaby.com
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
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
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
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
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
