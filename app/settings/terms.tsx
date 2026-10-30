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
      title: "1. Objet et acceptation",
      content:
        "Ces conditions régissent l'utilisation de l'application SuiviBaby et la souscription des offres payantes. En créant un compte, vous les acceptez, ainsi que la politique de confidentialité.",
    },
    {
      title: "2. Éditeur",
      content:
        "L'application est éditée par TESFA, 78 avenue des Champs-Élysées, 75008 Paris, France. Les mentions légales complètes figurent sur suivibaby.com/mentions-legales. Contact : support@suivibaby.com.",
    },
    {
      title: "3. Avertissement médical important",
      content:
        "SuiviBaby est un outil d'organisation personnelle, pas un dispositif médical. Elle ne pose aucun diagnostic et ne remplace jamais l'avis, l'examen ou la prescription d'un médecin. Les statistiques, courbes et conseils sont donnés à titre informatif. En cas d'inquiétude, consultez un professionnel de santé. En cas d'urgence, appelez le 15 (SAMU) ou le 112.",
    },
    {
      title: "4. Compte et conditions d'accès",
      content:
        "L'application est réservée aux personnes majeures, titulaires de l'autorité parentale sur l'enfant suivi ou agissant avec l'accord de son représentant légal. Vous vous engagez à fournir des informations exactes et à garder vos identifiants confidentiels. Un compte est personnel : pour partager le suivi, utilisez la fonction d'invitation.",
    },
    {
      title: "5. Règles d'utilisation",
      content:
        "Vous vous engagez à utiliser l'application conformément à la loi, et notamment à ne pas tenter d'accéder aux données d'autres utilisateurs, contourner les mesures de sécurité, copier ou perturber l'application, ni enregistrer des contenus illicites ou des données concernant un enfant sans y être autorisé.",
    },
    {
      title: "6. Photos et contenus",
      content:
        "Vous restez propriétaire des contenus que vous ajoutez. Vous nous accordez uniquement le droit de les héberger et de les afficher, à vous et aux personnes invitées. Les photos sont destinées à un usage strictement privé : il est interdit d'ajouter des photos montrant les parties intimes d'un enfant ou tout contenu corporel sensible. Tout contenu peut être signalé depuis l'application ou à contact@suivibaby.com. Nous pouvons retirer un contenu manifestement illicite ou contraire à la sécurité de l'enfant.",
    },
    {
      title: "7. Partage du suivi",
      content:
        "Vous pouvez inviter d'autres personnes à consulter ou compléter le suivi d'un enfant, choisir leurs droits et les révoquer à tout moment. Vous êtes responsable du choix des personnes invitées. Leur nombre dépend de votre offre.",
    },
    {
      title: "8. Commande vocale",
      content:
        "La commande vocale est facultative. Elle s'appuie sur des services d'intelligence artificielle qui peuvent mal comprendre une phrase : vérifiez toujours les événements proposés avant de les valider.",
    },
    {
      title: "9. Offres et abonnements",
      content:
        "L'offre gratuite donne accès au suivi sans limite de durée, avec des limites d'usage indiquées dans l'application. Les offres Premium et Famille sont proposées en abonnement mensuel ou annuel, ou en achat unique « à vie » ; le prix affiché par l'App Store ou Google Play au moment de l'achat fait foi. Le paiement passe par votre compte Apple ou Google : nous n'avons jamais accès à vos coordonnées bancaires. Les abonnements se renouvellent automatiquement, sauf résiliation au moins 24 heures avant la fin de la période en cours. Si une période d'essai est proposée, elle est indiquée avant l'achat. Vous pouvez résilier à tout moment depuis les réglages d'abonnement de votre store ; l'accès reste actif jusqu'à la fin de la période payée et vos données sont conservées.",
    },
    {
      title: "10. Droit de rétractation et remboursements",
      content:
        "Pour un service numérique dont l'exécution commence immédiatement, le droit de rétractation de 14 jours ne s'applique plus lorsque vous avez demandé l'accès immédiat et renoncé à ce droit lors de l'achat (article L.221-28 du Code de la consommation). Les achats étant encaissés par Apple ou Google, les demandes de remboursement se font auprès d'eux. Notre support peut vous accompagner : support@suivibaby.com.",
    },
    {
      title: "11. Données personnelles",
      content:
        "Le traitement de vos données, dont les données de santé de votre enfant, est décrit dans la politique de confidentialité. Il repose sur votre consentement explicite, recueilli à l'inscription. Vous pouvez exporter vos données à tout moment depuis Paramètres → Export ; nous vous recommandons de le faire régulièrement.",
    },
    {
      title: "12. Disponibilité et évolution du service",
      content:
        "Nous mettons en œuvre les moyens raisonnables pour assurer l'accès à l'application, qui peut être interrompu pour maintenance, mise à jour ou incident. Les saisies faites hors connexion sont synchronisées au retour du réseau. Une fonctionnalité payante substantielle ne sera pas retirée pendant une période déjà payée sans compensation.",
    },
    {
      title: "13. Responsabilité",
      content:
        "TESFA est responsable de la bonne exécution du service conformément à la loi. Sa responsabilité ne saurait être engagée pour les dommages résultant d'une décision médicale prise sur la seule base des informations de l'application, d'une erreur de saisie, d'une utilisation non conforme ou d'un cas de force majeure. Rien dans ces conditions ne limite les droits que vous tenez du Code de la consommation.",
    },
    {
      title: "14. Propriété intellectuelle",
      content:
        "L'application, son code, son design, ses textes et la marque SuiviBaby sont la propriété de TESFA ou de ses partenaires. Nous vous accordons un droit d'utilisation personnel, non exclusif et non transférable, pour la durée de votre compte.",
    },
    {
      title: "15. Suppression du compte",
      content:
        "Vous pouvez supprimer votre compte à tout moment depuis Paramètres → Supprimer le compte. La suppression devient définitive après un délai de 30 jours, pendant lequel vous pouvez l'annuler. Pensez à résilier votre abonnement dans votre store : la suppression du compte ne l'arrête pas automatiquement.",
    },
    {
      title: "16. Modifications des conditions",
      content:
        "Les changements importants vous sont notifiés dans l'application ou par e-mail au moins 30 jours avant leur entrée en vigueur. Si vous ne les acceptez pas, vous pouvez supprimer votre compte avant cette date.",
    },
    {
      title: "17. Droit applicable et litiges",
      content:
        "Ces conditions sont soumises au droit français. En cas de difficulté, contactez d'abord support@suivibaby.com. À défaut de solution amiable, vous pouvez recourir gratuitement au médiateur de la consommation indiqué sur suivibaby.com/terms. Si vous êtes consommateur, vous pouvez saisir la juridiction de votre domicile. La version complète de ces conditions est disponible sur suivibaby.com/terms.",
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
              Dernière mise à jour : 30 octobre 2026
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
              Bienvenue sur SuiviBaby. Ces conditions d'utilisation régissent votre accès et
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
