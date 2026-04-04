// app/settings/premium.tsx
// Page pricing in-app — comparaison Gratuit vs Premium vs Famille

import { getNeutralColors } from "@/constants/dashboardColors";
import { usePremium, type PremiumTier } from "@/contexts/PremiumContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/services/revenueCatService";
import { InfoModal } from "@/components/ui/InfoModal";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import type { PurchasesPackage } from "react-native-purchases";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type BillingCycle = "monthly" | "annual" | "lifetime";

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
  const { tier: currentTier, isGrandfathered } = usePremium();
  const [selectedPlan, setSelectedPlan] = useState<"premium" | "family">("premium");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [rcPackages, setRcPackages] = useState<Record<string, PurchasesPackage>>({});
  const [purchasing, setPurchasing] = useState(false);
  const [modalConfig, setModalConfig] = useState({ visible: false, title: "", message: "" });

  // Charger les offerings RevenuCat (prix localisés)
  useEffect(() => {
    getOfferings().then((offerings) => {
      const pkgs: Record<string, PurchasesPackage> = {};
      if (offerings.default) {
        for (const pkg of offerings.default.availablePackages) {
          if (pkg.packageType === "MONTHLY") pkgs["premium_monthly"] = pkg;
          else if (pkg.packageType === "ANNUAL") pkgs["premium_annual"] = pkg;
          else if (pkg.packageType === "LIFETIME") pkgs["lifetime"] = pkg;
        }
      }
      if (offerings.family) {
        for (const pkg of offerings.family.availablePackages) {
          if (pkg.packageType === "MONTHLY") pkgs["family_monthly"] = pkg;
          else if (pkg.packageType === "ANNUAL") pkgs["family_annual"] = pkg;
          else if (pkg.packageType === "LIFETIME") pkgs["family_lifetime"] = pkg;
        }
      }
      setRcPackages(pkgs);
    }).catch(() => {});
  }, []);

  const handleSubscribe = useCallback(
    async (plan: PlanConfig) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      let pkgKey = "";
      if (plan.tier === "premium") {
        pkgKey = billingCycle === "lifetime" ? "lifetime" : billingCycle === "monthly" ? "premium_monthly" : "premium_annual";
      } else if (plan.tier === "family") {
        pkgKey = billingCycle === "lifetime" ? "family_lifetime" : billingCycle === "monthly" ? "family_monthly" : "family_annual";
      }
      const pkg = rcPackages[pkgKey];

      if (!pkg) {
        setModalConfig({
          visible: true,
          title: "Indisponible",
          message: "Ce plan n'est pas encore disponible. Reessayez plus tard.",
        });
        return;
      }

      setPurchasing(true);
      try {
        const result = await purchasePackage(pkg);
        if (result.success) {
          setModalConfig({
            visible: true,
            title: "Bienvenue dans SuiviBaby+ !",
            message: "Votre abonnement est actif. Profitez de toutes les fonctionnalites Premium.",
          });
        }
      } catch {
        setModalConfig({
          visible: true,
          title: "Erreur",
          message: "L'achat a echoue. Veuillez reessayer.",
        });
      } finally {
        setPurchasing(false);
      }
    },
    [billingCycle, rcPackages]
  );

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const info = await restorePurchases();
      if (info) {
        setModalConfig({
          visible: true,
          title: "Achats restaures",
          message: "Vos achats precedents ont ete restaures avec succes.",
        });
      }
    } catch {
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de restaurer les achats. Verifiez votre connexion.",
      });
    }
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: nc.background }]}
      edges={["bottom"]}
    >
      <Stack.Screen options={{ title: "SuiviBaby+", headerBackTitle: "Retour" }} />
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

        {/* Plan toggle : Premium / Famille */}
        <View
          style={[styles.cycleToggle, { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight }]}
        >
          <TouchableOpacity
            style={[
              styles.cycleButton,
              selectedPlan === "premium" && [styles.cycleButtonActive, { backgroundColor: nc.todayAccent }],
            ]}
            onPress={() => setSelectedPlan("premium")}
          >
            <Text
              style={[styles.cycleButtonText, { color: selectedPlan === "premium" ? nc.white : nc.textMuted }]}
            >
              Premium
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.cycleButton,
              selectedPlan === "family" && [styles.cycleButtonActive, { backgroundColor: nc.todayAccent }],
            ]}
            onPress={() => setSelectedPlan("family")}
          >
            <Text
              style={[styles.cycleButtonText, { color: selectedPlan === "family" ? nc.white : nc.textMuted }]}
            >
              Famille
            </Text>
          </TouchableOpacity>
        </View>

        {/* Plan Gratuit */}
        {(() => {
          const freePlan = PLANS[0];
          const isCurrentFree = currentTier === "free";
          return (
            <View
              style={[
                styles.planCard,
                { backgroundColor: nc.backgroundCard, borderColor: nc.border },
                isCurrentFree && { borderColor: nc.success, borderWidth: 1.5 },
              ]}
            >
              <View style={styles.radioRow}>
                <Text style={[styles.planName, { color: nc.textStrong }]}>Gratuit</Text>
                {isCurrentFree && (
                  <View style={[styles.currentBadgeSmall, { backgroundColor: nc.success + "20" }]}>
                    <Text style={[styles.currentBadgeSmallText, { color: nc.success }]}>Plan actuel</Text>
                  </View>
                )}
              </View>
              <View style={styles.featuresList}>
                {freePlan.features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={nc.textMuted} />
                    <Text style={[styles.featureText, { color: nc.textNormal }]}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Plan sélectionné (Premium ou Famille) */}
        {(() => {
          const plan = selectedPlan === "premium" ? PLANS[1] : PLANS[2];
          const isCurrentPlan = plan.tier === currentTier;
          const lifetimePrice = selectedPlan === "premium" ? "79,99€" : "119,99€";

          return (
            <View
              style={[
                styles.planCard,
                { backgroundColor: nc.backgroundCard, borderColor: nc.todayAccent, borderWidth: 2 },
              ]}
            >
              {plan.badge && (
                <View style={[styles.planBadge, { backgroundColor: nc.todayAccent }]}>
                  <Text style={styles.planBadgeText}>{plan.badge}</Text>
                </View>
              )}

              <View style={styles.radioRow}>
                <Text style={[styles.planName, { color: nc.textStrong }]}>{plan.name}</Text>
                {isCurrentPlan && (
                  <View style={[styles.currentBadgeSmall, { backgroundColor: nc.todayAccent + "20" }]}>
                    <Text style={[styles.currentBadgeSmallText, { color: nc.todayAccent }]}>Plan actuel</Text>
                  </View>
                )}
              </View>

              {/* Features */}
              <View style={styles.featuresList}>
                {plan.features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={nc.todayAccent} />
                    <Text style={[styles.featureText, { color: nc.textNormal }]}>{feature}</Text>
                  </View>
                ))}
              </View>

              {/* Options de facturation */}
              <View style={styles.billingOptions}>
                {([
                  { key: "monthly" as BillingCycle, label: "Mensuel", price: plan.monthlyPrice, sub: null },
                  { key: "annual" as BillingCycle, label: "Annuel", price: plan.annualPrice, sub: `soit ${plan.annualMonthly}/mois`, badge: "-37%" },
                  { key: "lifetime" as BillingCycle, label: "A vie", price: lifetimePrice, sub: "paiement unique" },
                ]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.billingOption,
                      { borderColor: billingCycle === opt.key ? nc.todayAccent : nc.border },
                      billingCycle === opt.key && { backgroundColor: nc.todayAccent + "10" },
                    ]}
                    onPress={() => setBillingCycle(opt.key)}
                  >
                    <View style={[styles.radioOuter, { borderColor: billingCycle === opt.key ? nc.todayAccent : nc.textMuted }]}>
                      {billingCycle === opt.key && <View style={[styles.radioInner, { backgroundColor: nc.todayAccent }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.billingLabel, { color: nc.textStrong }]}>{opt.label}</Text>
                        {opt.badge && (
                          <View style={[styles.savingsBadge, { backgroundColor: "#22c55e" }]}>
                            <Text style={styles.savingsBadgeText}>{opt.badge}</Text>
                          </View>
                        )}
                      </View>
                      {opt.sub && <Text style={[styles.billingSub, { color: nc.textLight }]}>{opt.sub}</Text>}
                    </View>
                    <Text style={[styles.billingPrice, { color: nc.textStrong }]}>{opt.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Bouton d'action */}
              {(() => {
                // Logique du label basée sur le tier réel vs le plan affiché
                const userIsPaying = currentTier === "premium" || currentTier === "family";
                const exactSamePlan = plan.tier === currentTier;

                let buttonLabel: string;
                let disabled = false;

                if (billingCycle === "lifetime") {
                  if (exactSamePlan) {
                    buttonLabel = "Deja abonne";
                    disabled = true;
                  } else {
                    buttonLabel = "Acheter a vie";
                  }
                } else if (exactSamePlan) {
                  buttonLabel = "Changer de cycle";
                } else if (!userIsPaying) {
                  // User free → premier abonnement
                  buttonLabel = "Commencer";
                } else {
                  // User payant → changement de tier
                  buttonLabel = plan.tier === "family" ? "Passer a Famille" : "Passer a Premium";
                }

                return (
                  <TouchableOpacity
                    style={[
                      styles.subscribeButton,
                      { backgroundColor: nc.todayAccent },
                      (disabled || purchasing) && { opacity: 0.5 },
                    ]}
                    onPress={() => handleSubscribe(plan)}
                    disabled={disabled || purchasing}
                  >
                    <Text style={[styles.subscribeButtonText, { color: nc.white }]}>
                      {buttonLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          );
        })()}

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

      <InfoModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onClose={() => setModalConfig({ visible: false, title: "", message: "" })}
      />
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
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  subscribeButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  mainSubscribeButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
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
  currentBadgeSmall: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: "auto",
  },
  currentBadgeSmallText: { fontSize: 12, fontWeight: "600" },
  billingOptions: { gap: 10, marginTop: 16 },
  billingOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  billingLabel: { fontSize: 15, fontWeight: "600" },
  billingSub: { fontSize: 12, marginTop: 2 },
  billingPrice: { fontSize: 16, fontWeight: "700" },
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
