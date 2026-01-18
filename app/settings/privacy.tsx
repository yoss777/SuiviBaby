import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function PrivacyScreen() {
  const colorScheme = useColorScheme() ?? "light";

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
        "Vos données sont hébergées par Google Firebase sur des serveurs sécurisés situés au sein de l'Union Européenne (Belgique ou Allemagne). Tout transfert éventuel vers une entité hors UE est strictement encadré par les Clauses Contractuelles Types (CCT) de la Commission Européenne pour garantir un niveau de protection équivalent.",
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
    <ThemedView style={styles.screen}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["top", "bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Confidentialité",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.header}>
            <View
              style={[
                styles.headerIcon,
                { backgroundColor: Colors[colorScheme].tint + "20" },
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
                { color: Colors[colorScheme].tabIconDefault },
              ]}
            >
              Dernière mise à jour : 1er janvier 2026
            </Text>
          </ThemedView>

          <ThemedView style={styles.content}>
            <ThemedText style={styles.intro}>
              Chez SuiviBaby, la protection de vos donnees personnelles est
              notre priorite absolue. Cette politique explique comment nous
              collectons, utilisons et protegeons vos informations.
            </ThemedText>

            {sections.map((section, index) => (
              <View key={index} style={styles.section}>
                <ThemedText style={styles.sectionTitle}>
                  {section.title}
                </ThemedText>
                <Text
                  style={[
                    styles.sectionContent,
                    { color: Colors[colorScheme].tabIconDefault },
                  ]}
                >
                  {section.content}
                </Text>
              </View>
            ))}
          </ThemedView>

          <ThemedView style={styles.footer}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.footerText}>
              Pour toute question : privacy@suivibaby.com
            </ThemedText>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
});
