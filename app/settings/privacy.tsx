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
        "Le service SuiviBaby est édité par TESFA, 78 avenue des Champs-Élysées, 75008 Paris, France. Pour toute question relative à vos données : privacy@suivibaby.com.",
    },
    {
      title: "2. Données traitées",
      content:
        "Compte : adresse e-mail, pseudonyme, méthode de connexion. Profil de l'enfant : prénom, date de naissance, sexe, allergies éventuelles. Santé et suivi de l'enfant (données sensibles) : repas, sommeil, couches, température, médicaments, symptômes, vaccins, mesures de croissance, notes. Photos ajoutées aux jalons et souvenirs. Commande vocale (facultative) : enregistrement audio et texte transcrit. Partage : invitations, codes, droits d'accès, commentaires et réactions. Préférences et preuve horodatée de vos consentements. Appareil : jeton de notification et données techniques de diagnostic. Abonnement : offre et statut (jamais vos coordonnées bancaires). Signalements de contenu.",
    },
    {
      title: "3. Finalités et bases légales",
      content:
        "Gestion du compte et synchronisation : exécution du contrat (art. 6.1.b RGPD). Suivi de santé de l'enfant, statistiques, courbes et conseils : votre consentement explicite (art. 9.2.a), recueilli par une case distincte à l'inscription. Commande vocale : consentement explicite, à chaque utilisation. Partage avec les personnes invitées : contrat et consentement. Notifications et récapitulatif hebdomadaire : consentement, uniquement si vous les activez. Abonnement : contrat et obligations comptables. Sécurité, prévention des abus et diagnostic des erreurs : intérêt légitime (art. 6.1.f). Nous n'utilisons pas vos données à des fins publicitaires et ne les vendons pas.",
    },
    {
      title: "4. Données des enfants",
      content:
        "SuiviBaby est destinée aux adultes titulaires de l'autorité parentale, ou agissant avec leur accord. En créant le profil d'un enfant, vous confirmez être habilité à le faire. Vous pouvez retirer votre consentement à tout moment en supprimant les données concernées, le profil de l'enfant ou votre compte.",
    },
    {
      title: "5. Commande vocale et intelligence artificielle",
      content:
        "L'enregistrement est envoyé de façon chiffrée à notre serveur, puis à AssemblyAI pour être transcrit. Le texte transcrit et l'heure locale sont envoyés à Anthropic (modèle Claude) pour identifier les événements à créer. Rien n'est enregistré sans votre validation. L'audio n'est jamais stocké par SuiviBaby, la transcription est supprimée chez AssemblyAI juste après le traitement, et le texte est conservé au plus 5 minutes dans un cache technique. Ni le prénom de l'enfant ni votre identifiant de compte ne sont transmis à Anthropic.",
    },
    {
      title: "6. Destinataires et sous-traitants",
      content:
        "Vos données sont accessibles à vous, aux personnes que vous invitez selon les droits que vous leur donnez, à un nombre restreint de personnes habilitées de TESFA lorsque c'est nécessaire (support à votre demande, signalement, sécurité), et à nos sous-traitants : Google Firebase (hébergement, authentification, fonctions serveur), AssemblyAI (transcription vocale), Anthropic (interprétation du texte dicté et conseils, sans prénom ni identifiant), RevenueCat (abonnements), Resend (e-mails), Expo (notifications push) et Sentry (diagnostic des erreurs). Apple et Google interviennent comme responsables distincts pour la connexion avec leur compte et le paiement dans leurs stores.",
    },
    {
      title: "7. Hébergement et transferts hors UE",
      content:
        "La base de données est hébergée par Google Firebase dans l'Union européenne (région eur3) et les fonctions serveur en Belgique. Certains prestataires sont situés aux États-Unis : ces transferts sont encadrés par le EU-US Data Privacy Framework lorsque le prestataire y est certifié, et à défaut par les clauses contractuelles types de la Commission européenne.",
    },
    {
      title: "8. Durées de conservation",
      content:
        "Compte et suivi de l'enfant : tant que votre compte est actif. Après une demande de suppression du compte : 30 jours pendant lesquels vous pouvez annuler, puis effacement définitif. Profil d'enfant supprimé : 30 jours, puis effacement définitif. Audio : non conservé. Codes d'invitation : 7 jours. Journaux techniques : 90 jours maximum. Preuve de consentement : durée du compte, puis 5 ans. Données de facturation : 10 ans (obligation comptable), conservées par les stores et notre prestataire d'abonnement.",
    },
    {
      title: "9. Sécurité",
      content:
        "Les échanges sont chiffrés (TLS) et les données sont chiffrées au repos par notre hébergeur. L'accès à chaque enfant est contrôlé par des règles strictes côté serveur, l'application vérifie son intégrité auprès du serveur et vous pouvez activer un verrouillage biométrique. Les données ne sont pas chiffrées de bout en bout : nos serveurs peuvent les traiter pour faire fonctionner le service (synchronisation, export, statistiques). En cas de violation de données présentant un risque pour vos droits, nous notifierons la CNIL et, si nécessaire, vous en informerons.",
    },
    {
      title: "10. Vos droits",
      content:
        "Vous disposez des droits d'accès, de rectification, d'effacement (Paramètres → Supprimer le compte), de portabilité (Paramètres → Export), de retrait du consentement, d'opposition, de limitation et du droit de définir des directives sur le sort de vos données après votre décès. Écrivez à privacy@suivibaby.com depuis l'adresse liée à votre compte : nous répondons sous un mois. Vous pouvez aussi introduire une réclamation auprès de la CNIL (www.cnil.fr).",
    },
    {
      title: "11. Modifications",
      content:
        "Nous pouvons faire évoluer cette politique. Les changements importants vous seront signalés dans l'application ou par e-mail. La version complète et à jour est disponible sur suivibaby.com/privacy.",
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
              Chez SuiviBaby, la protection de vos données personnelles est
              notre priorité absolue. Cette politique explique comment nous
              collectons, utilisons et protégeons vos informations.
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
