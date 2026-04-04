// app/settings/premium.tsx
// Page pricing in-app — comparaison Gratuit vs Premium vs Famille

import { getNeutralColors } from "@/constants/dashboardColors";
import { usePremium, type PremiumTier } from "@/contexts/PremiumContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type BillingCycle = "monthly" | "annual";

interface PlanConfig {
  tier: PremiumTier;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  annualMonthly: string;
  savings: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}

const PLANS: PlanConfig[] = [
  {
    tier: "free",
    name: "Gratuit",
    monthlyPrice: "0€",
    annualPrice: "0€",
    annualMonthly: "0€",
    savings: "",
    features: [
      "Suivi multi-bebe illimite",
      "18 types d'evenements",
      "Historique 90 jours",
      "2 co-parents",
      "3 commandes vocales/jour",
      "1 export PDF",
      "Mode nuit automatique",
    ],
  },
  {
    tier: "premium",
    name: "Premium",
    monthlyPrice: "3,99€",
    annualPrice: "29,99€",
    annualMonthly: "2,49€",
    savings: "-37%",
    highlighted: true,
    badge: "Populaire",
    features: [
      "Tout le plan Gratuit",
      "Historique illimite",
      "Exports PDF illimites",
      "Commandes vocales illimitees",
      "Partage illimite",
      "Statistiques avancees",
      "Courbes OMS",
      "Insights IA",
      "Widgets iOS/Android",
      "Rapport pediatre PDF",
    ],
  },
  {
    tier: "family",
    name: "Famille",
    monthlyPrice: "6,99€",
    annualPrice: "44,99€",
    annualMonthly: "3,74€",
    savings: "-46%",
    features: [
      "Tout le plan Premium",
      "5 comptes lies",
      "Dashboard partage temps reel",
      "Notifications croisees",
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: "Puis-je annuler a tout moment ?",
    a: "Oui, vous pouvez annuler votre abonnement a tout moment depuis les parametres de votre store (App Store ou Google Play). Vous conservez l'acces Premium jusqu'a la fin de la periode payee.",
  },
  {
    q: "L'essai gratuit est-il sans engagement ?",
    a: "Oui, les 14 premiers jours sont gratuits. Si vous annulez avant la fin de l'essai, vous ne serez pas facture.",
  },
  {
    q: "Mes donnees sont-elles conservees si je repasse en Gratuit ?",
    a: "Oui, toutes vos donnees restent intactes. Seul l'acces a l'historique au-dela de 90 jours et les fonctionnalites Premium sont desactives.",
  },
];

export default function PremiumScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const router = useRouter();
  const { tier: currentTier, isPremium, isGrandfathered } = usePremium();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleSubscribe = useCallback(
    (plan: PlanConfig) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // TODO: Connecter à RevenueCat quand les API keys seront prêtes
      // Purchases.purchasePackage(package)
      console.log(`[PREMIUM] Subscribe to ${plan.tier} (${billingCycle})`);
    },
    [billingCycle]
  );

  const handleRestore = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // TODO: Purchases.restorePurchases()
    console.log("[PREMIUM] Restore purchases");
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: nc.background }]}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <FontAwesome name="crown" size={36} color={nc.todayAccent} />
          <Text style={[styles.title, { color: nc.textStrong }]}>
            Choisissez votre plan
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            14 jours d'essai gratuit, sans engagement.
          </Text>
        </View>

        {/* Grandfathered notice */}
        {isGrandfathered && (
          <View
            style={[
              styles.grandfatheredBanner,
              { backgroundColor: nc.todayAccent + "15", borderColor: nc.todayAccent + "30" },
            ]}
          >
            <FontAwesome name="heart" size={16} color={nc.todayAccent} />
            <Text style={[styles.grandfatheredText, { color: nc.todayAccent }]}>
              Merci d'etre un early adopter ! Vos donnees restent accessibles sans limite.
            </Text>
          </View>
        )}

        {/* Billing cycle toggle */}
        <View
          style={[styles.cycleToggle, { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight }]}
        >
          <TouchableOpacity
            style={[
              styles.cycleButton,
              billingCycle === "monthly" && [styles.cycleButtonActive, { backgroundColor: nc.todayAccent }],
            ]}
            onPress={() => setBillingCycle("monthly")}
          >
            <Text
              style={[
                styles.cycleButtonText,
                { color: billingCycle === "monthly" ? nc.white : nc.textMuted },
              ]}
            >
              Mensuel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.cycleButton,
              billingCycle === "annual" && [styles.cycleButtonActive, { backgroundColor: nc.todayAccent }],
            ]}
            onPress={() => setBillingCycle("annual")}
          >
            <Text
              style={[
                styles.cycleButtonText,
                { color: billingCycle === "annual" ? nc.white : nc.textMuted },
              ]}
            >
              Annuel
            </Text>
            <View style={[styles.savingsBadge, { backgroundColor: "#22c55e" }]}>
              <Text style={styles.savingsBadgeText}>-37%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Plan cards */}
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.tier === currentTier;
          const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
          const perMonth = billingCycle === "annual" ? plan.annualMonthly : plan.monthlyPrice;

          return (
            <View
              key={plan.tier}
              style={[
                styles.planCard,
                { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight },
                plan.highlighted && { borderColor: nc.todayAccent, borderWidth: 2 },
              ]}
            >
              {plan.badge && (
                <View style={[styles.planBadge, { backgroundColor: nc.todayAccent }]}>
                  <Text style={styles.planBadgeText}>{plan.badge}</Text>
                </View>
              )}

              <Text style={[styles.planName, { color: nc.textStrong }]}>{plan.name}</Text>

              <View style={styles.priceRow}>
                <Text style={[styles.price, { color: nc.textStrong }]}>{price}</Text>
                {plan.tier !== "free" && (
                  <Text style={[styles.pricePeriod, { color: nc.textMuted }]}>
                    /{billingCycle === "monthly" ? "mois" : "an"}
                  </Text>
                )}
              </View>

              {billingCycle === "annual" && plan.tier !== "free" && (
                <Text style={[styles.perMonthText, { color: nc.textLight }]}>
                  soit {perMonth}/mois
                </Text>
              )}

              <View style={styles.featuresList}>
                {plan.features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={plan.tier === "free" ? nc.textMuted : nc.todayAccent}
                    />
                    <Text style={[styles.featureText, { color: nc.textNormal }]}>
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>

              {plan.tier === "free" ? (
                isCurrentPlan && (
                  <View style={[styles.currentBadge, { borderColor: nc.textMuted }]}>
                    <Text style={[styles.currentBadgeText, { color: nc.textMuted }]}>
                      Plan actuel
                    </Text>
                  </View>
                )
              ) : (
                <TouchableOpacity
                  style={[
                    styles.subscribeButton,
                    { backgroundColor: plan.highlighted ? nc.todayAccent : nc.textStrong },
                    isCurrentPlan && { opacity: 0.5 },
                  ]}
                  onPress={() => handleSubscribe(plan)}
                  disabled={isCurrentPlan}
                >
                  <Text style={[styles.subscribeButtonText, { color: nc.white }]}>
                    {isCurrentPlan ? "Plan actuel" : "Essai gratuit 14 jours"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Restore purchases */}
        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
          <Text style={[styles.restoreText, { color: nc.todayAccent }]}>
            Restaurer mes achats
          </Text>
        </TouchableOpacity>

        {/* FAQ */}
        <View style={styles.faqSection}>
          <Text style={[styles.faqTitle, { color: nc.textStrong }]}>
            Questions frequentes
          </Text>
          {FAQ_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.faqItem, { borderColor: nc.borderLight }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedFaq(expandedFaq === index ? null : index);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQuestion, { color: nc.textStrong }]}>
                  {item.q}
                </Text>
                <Ionicons
                  name={expandedFaq === index ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={nc.textMuted}
                />
              </View>
              {expandedFaq === index && (
                <Text style={[styles.faqAnswer, { color: nc.textMuted }]}>
                  {item.a}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Legal */}
        <Text style={[styles.legal, { color: nc.textLight }]}>
          L'abonnement se renouvelle automatiquement sauf annulation au moins 24h avant la fin de la periode.
          Le paiement est debite via votre compte App Store ou Google Play.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { alignItems: "center", marginBottom: 24 },
  title: { fontSize: 24, fontWeight: "700", marginTop: 12 },
  subtitle: { fontSize: 15, marginTop: 6 },
  grandfatheredBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  grandfatheredText: { fontSize: 13, fontWeight: "500", flex: 1 },
  cycleToggle: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
  },
  cycleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  cycleButtonActive: {},
  cycleButtonText: { fontSize: 15, fontWeight: "600" },
  savingsBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  savingsBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    overflow: "hidden",
  },
  planBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  planBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  planName: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 2 },
  price: { fontSize: 32, fontWeight: "800" },
  pricePeriod: { fontSize: 15, marginLeft: 4 },
  perMonthText: { fontSize: 13, marginBottom: 16 },
  featuresList: { marginTop: 12, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 14, flex: 1 },
  subscribeButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  subscribeButtonText: { fontSize: 16, fontWeight: "600" },
  currentBadge: {
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  currentBadgeText: { fontSize: 14, fontWeight: "500" },
  restoreButton: { alignItems: "center", paddingVertical: 16 },
  restoreText: { fontSize: 14, fontWeight: "500" },
  faqSection: { marginTop: 8 },
  faqTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  faqItem: { borderBottomWidth: 1, paddingVertical: 14 },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: { fontSize: 15, fontWeight: "600", flex: 1, paddingRight: 8 },
  faqAnswer: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 20 },
});
