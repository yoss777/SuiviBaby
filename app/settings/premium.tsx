// app/settings/premium.tsx
// Page pricing in-app — comparaison Gratuit vs Premium vs Famille

import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import { usePremium, type PremiumTier } from "@/contexts/PremiumContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/services/revenueCatService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const {
    tier: currentTier,
    billingPeriod: currentBilling,
    isGrandfathered,
    devOverrideTier,
    devOverrideBilling,
  } = usePremium();
  const [selectedPlan, setSelectedPlan] = useState<
    "free" | "premium" | "family"
  >("premium");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabIndicatorX = useSharedValue(1); // index initial = 1 (Premium)
  const PLAN_TABS = ["free", "premium", "family"] as const;
  const tabWidth = tabsWidth > 0 ? (tabsWidth - 10 - 12) / 3 : 0; // 10 = padding*2, 12 = gap*2
  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(5 + tabIndicatorX.value * (tabWidth + 6), {
          duration: 250,
        }),
      },
    ],
    width: tabWidth,
  }));
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [rcPackages, setRcPackages] = useState<
    Record<string, PurchasesPackage>
  >({});
  const [purchasing, setPurchasing] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });

  // Charger les offerings RevenuCat (prix localisés)
  useEffect(() => {
    getOfferings()
      .then((offerings) => {
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
            else if (pkg.packageType === "LIFETIME")
              pkgs["family_lifetime"] = pkg;
          }
        }
        setRcPackages(pkgs);
      })
      .catch(() => {});
  }, []);

  const handleSubscribe = useCallback(
    async (plan: PlanConfig) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      let pkgKey = "";
      if (plan.tier === "premium") {
        pkgKey =
          billingCycle === "lifetime"
            ? "lifetime"
            : billingCycle === "monthly"
              ? "premium_monthly"
              : "premium_annual";
      } else if (plan.tier === "family") {
        pkgKey =
          billingCycle === "lifetime"
            ? "family_lifetime"
            : billingCycle === "monthly"
              ? "family_monthly"
              : "family_annual";
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
            message:
              "Votre abonnement est actif. Profitez de toutes les fonctionnalites Premium.",
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
    [billingCycle, rcPackages],
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
        message:
          "Impossible de restaurer les achats. Verifiez votre connexion.",
      });
    }
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: nc.background }]}
      edges={["bottom"]}
    >
      <Stack.Screen
        options={{ title: "SuiviBaby+", headerBackTitle: "Retour" }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header} accessibilityRole="header">
          <FontAwesome name="crown" size={36} color={nc.todayAccent} />
          <Text style={[styles.title, { color: nc.textStrong }]}>
            {currentTier === "free"
              ? "Choisissez votre plan"
              : "Gerez votre abonnement"}
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            {currentTier === "free"
              ? "14 jours d'essai gratuit, sans engagement."
              : "Changez de plan ou de cycle a tout moment."}
          </Text>
        </View>

        {/* Grandfathered notice */}
        {isGrandfathered && (
          <View
            style={[
              styles.grandfatheredBanner,
              {
                backgroundColor: nc.todayAccent + "15",
                borderColor: nc.todayAccent + "30",
              },
            ]}
          >
            <FontAwesome name="heart" size={16} color={nc.todayAccent} />
            <Text style={[styles.grandfatheredText, { color: nc.todayAccent }]}>
              Merci d'etre un early adopter ! Vos donnees restent accessibles
              sans limite.
            </Text>
          </View>
        )}

        {/* Plan toggle : Gratuit / Premium / Famille (sliding indicator) */}
        <View
          style={[
            styles.cycleToggle,
            { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight },
          ]}
          onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
        >
          {tabWidth > 0 && (
            <Animated.View
              style={[
                styles.tabIndicator,
                { backgroundColor: nc.todayAccent },
                animatedIndicatorStyle,
              ]}
            />
          )}
          {PLAN_TABS.map((key, index) => {
            const labels = {
              free: "Gratuit",
              premium: "Premium",
              family: "Famille",
            };
            return (
              <TouchableOpacity
                key={key}
                style={styles.cycleButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  tabIndicatorX.value = index;
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut,
                  );
                  setSelectedPlan(key);
                }}
                accessibilityRole="tab"
                accessibilityLabel={`Plan ${labels[key]}`}
                accessibilityState={{ selected: selectedPlan === key }}
              >
                <View style={styles.tabLabelRow}>
                  <Text
                    style={[
                      styles.cycleButtonText,
                      { color: selectedPlan === key ? nc.white : nc.textMuted },
                    ]}
                  >
                    {labels[key]}
                  </Text>
                  {key === currentTier && (
                    <View style={[styles.activeTabDot, { backgroundColor: selectedPlan === key ? nc.white : nc.success }]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedPlan === "free" &&
          (() => {
            const freePlan = PLANS[0];
            const isCurrentFree = currentTier === "free";
            const borderColor = isCurrentFree ? nc.success : nc.todayAccent;
            return (
              <View
                style={[
                  styles.planCard,
                  {
                    backgroundColor: nc.backgroundCard,
                    borderColor,
                    borderWidth: isCurrentFree ? 1.5 : 2,
                  },
                ]}
              >
                <View style={styles.radioRow}>
                  <Text style={[styles.planName, { color: nc.textStrong }]}>
                    Gratuit
                  </Text>
                </View>
                <View style={styles.featuresList}>
                  {freePlan.features.map((feature, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={borderColor}
                      />
                      <Text
                        style={[styles.featureText, { color: nc.textNormal }]}
                      >
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>
                {!isCurrentFree && (
                  <TouchableOpacity
                    style={[
                      styles.subscribeButton,
                      { backgroundColor: nc.todayAccent },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Linking.openURL(
                        Platform.OS === "ios"
                          ? "https://apps.apple.com/account/subscriptions"
                          : "https://play.google.com/store/account/subscriptions",
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Gerer mon abonnement"
                    accessibilityHint="Ouvre les parametres d'abonnement du store pour annuler ou modifier"
                  >
                    <Text
                      style={[styles.subscribeButtonText, { color: nc.white }]}
                    >
                      Gerer mon abonnement
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

        {/* Plan sélectionné (Premium ou Famille, masqué si Gratuit actif) */}
        {selectedPlan !== "free" &&
          (() => {
            const plan = selectedPlan === "premium" ? PLANS[1] : PLANS[2];
            const isCurrentPlan = plan.tier === currentTier;
            const lifetimePrice =
              selectedPlan === "premium" ? "79,99€" : "119,99€";
            const cardBorderColor = isCurrentPlan ? nc.success : nc.todayAccent;

            return (
              <View
                style={[
                  styles.planCard,
                  {
                    backgroundColor: nc.backgroundCard,
                    borderColor: cardBorderColor,
                    borderWidth: 2,
                  },
                ]}
              >
                {plan.badge && (
                  <View
                    style={[
                      styles.planBadge,
                      { backgroundColor: cardBorderColor },
                    ]}
                  >
                    <Text style={styles.planBadgeText}>{plan.badge}</Text>
                  </View>
                )}

                <View style={styles.radioRow}>
                  <Text style={[styles.planName, { color: nc.textStrong }]}>
                    {plan.name}
                  </Text>
                </View>

                {/* Features */}
                <View style={styles.featuresList}>
                  {plan.features.map((feature, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={cardBorderColor}
                      />
                      <Text
                        style={[styles.featureText, { color: nc.textNormal }]}
                      >
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Options de facturation */}
                <View style={styles.billingOptions}>
                  {[
                    {
                      key: "monthly" as BillingCycle,
                      label: "Mensuel",
                      price: plan.monthlyPrice,
                      sub: null,
                    },
                    {
                      key: "annual" as BillingCycle,
                      label: "Annuel",
                      price: plan.annualPrice,
                      sub: `soit ${plan.annualMonthly}/mois`,
                      badge: "-37%",
                    },
                    {
                      key: "lifetime" as BillingCycle,
                      label: "A vie",
                      price: lifetimePrice,
                      sub: "paiement unique",
                    },
                  ].map((opt) => {
                    const isCurrentBilling =
                      isCurrentPlan && currentBilling === opt.key;
                    const isSelected = billingCycle === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.billingOption,
                          {
                            borderColor: isSelected
                              ? nc.todayAccent
                              : nc.border,
                          },
                          isSelected &&
                            !isCurrentBilling && {
                              backgroundColor: nc.todayAccent + "10",
                            },
                          isCurrentBilling && { borderColor: nc.success },
                        ]}
                        onPress={() => setBillingCycle(opt.key)}
                        disabled={isCurrentBilling}
                        activeOpacity={isCurrentBilling ? 1 : 0.7}
                        accessibilityRole="radio"
                        accessibilityLabel={`${opt.label} ${opt.price}${isCurrentBilling ? ", abonnement actuel" : ""}`}
                        accessibilityState={{
                          selected: isSelected,
                          disabled: isCurrentBilling,
                        }}
                      >
                        <View
                          style={[
                            styles.radioOuter,
                            {
                              borderColor: isCurrentBilling
                                ? "transparent"
                                : isSelected
                                  ? nc.todayAccent
                                  : nc.textMuted,
                            },
                          ]}
                        >
                          {isSelected && !isCurrentBilling && (
                            <View
                              style={[
                                styles.radioInner,
                                { backgroundColor: nc.todayAccent },
                              ]}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Text
                              style={[
                                styles.billingLabel,
                                {
                                  color: isCurrentBilling
                                    ? nc.success
                                    : nc.textStrong,
                                },
                              ]}
                            >
                              {opt.label}
                            </Text>
                            {isCurrentBilling && (
                              <View
                                style={[
                                  styles.currentBadgeSmall,
                                  { backgroundColor: nc.success + "20" },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.currentBadgeSmallText,
                                    { color: nc.success },
                                  ]}
                                >
                                  Actuel
                                </Text>
                              </View>
                            )}
                            {opt.badge && !isCurrentBilling && (
                              <View
                                style={[
                                  styles.savingsBadge,
                                  { backgroundColor: "#22c55e" },
                                ]}
                              >
                                <Text style={styles.savingsBadgeText}>
                                  {opt.badge}
                                </Text>
                              </View>
                            )}
                          </View>
                          {opt.sub && (
                            <Text
                              style={[
                                styles.billingSub,
                                { color: nc.textLight },
                              ]}
                            >
                              {opt.sub}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.billingPrice,
                            {
                              color: isCurrentBilling
                                ? nc.success
                                : nc.textStrong,
                            },
                          ]}
                        >
                          {opt.price}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Bouton d'action */}
                {(() => {
                  const userIsPaying =
                    currentTier === "premium" || currentTier === "family";
                  const isExactSamePlan = plan.tier === currentTier;
                  const isExactSameBilling =
                    isExactSamePlan && currentBilling === billingCycle;
                  const tierLabel =
                    plan.tier === "family" ? "Famille" : "Premium";

                  let buttonLabel: string;

                  if (isExactSameBilling) {
                    buttonLabel = "Abonnement actuel";
                  } else if (billingCycle === "lifetime") {
                    buttonLabel = `Acheter ${tierLabel} a vie`;
                  } else if (isExactSamePlan) {
                    buttonLabel =
                      billingCycle === "annual"
                        ? "Passer a l'annuel"
                        : "Passer au mensuel";
                  } else if (!userIsPaying) {
                    buttonLabel = `Essayer ${tierLabel} (14j)`;
                  } else {
                    buttonLabel = `Passer a ${tierLabel}`;
                  }

                  return (
                    <TouchableOpacity
                      style={[
                        styles.subscribeButton,
                        { backgroundColor: nc.todayAccent },
                        (isExactSameBilling || purchasing) && { opacity: 0.5 },
                      ]}
                      onPress={() => handleSubscribe(plan)}
                      disabled={isExactSameBilling || purchasing}
                      accessibilityRole="button"
                      accessibilityLabel={buttonLabel}
                      accessibilityState={{
                        disabled: isExactSameBilling || purchasing,
                      }}
                    >
                      <Text
                        style={[
                          styles.subscribeButtonText,
                          { color: nc.white },
                        ]}
                      >
                        {buttonLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            );
          })()}

        {/* Restore purchases + Manage subscription */}
        <View style={styles.linksRow}>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            accessibilityRole="button"
            accessibilityLabel="Restaurer mes achats precedents"
          >
            <Text style={[styles.restoreText, { color: nc.todayAccent }]}>
              Restaurer mes achats
            </Text>
          </TouchableOpacity>
          {currentTier !== "free" && (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => {
                Linking.openURL(
                  Platform.OS === "ios"
                    ? "https://apps.apple.com/account/subscriptions"
                    : "https://play.google.com/store/account/subscriptions",
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Annuler mon abonnement"
              accessibilityHint="Ouvre les parametres d'abonnement du store"
            >
              <Text style={[styles.restoreText, { color: nc.textLight }]}>
                Annuler mon abonnement
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* FAQ */}
        <View style={[styles.faqDivider, { borderColor: nc.borderLight }]} />
        <View style={styles.faqSection}>
          <Text style={[styles.faqTitle, { color: nc.textStrong }]}>
            Questions frequentes
          </Text>
          {FAQ_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.faqItem, { borderColor: nc.borderLight }]}
              accessibilityRole="button"
              accessibilityLabel={item.q}
              accessibilityState={{ expanded: expandedFaq === index }}
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

        {/* Dev toggle (dev only) */}
        {__DEV__ && (
          <View style={styles.devSection}>
            <Text style={[styles.devLabel, { color: nc.textLight }]}>
              DEV — tier: {currentTier} | billing: {currentBilling}
            </Text>
            <View style={styles.devButtons}>
              {(["free", "premium", "family"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.devButton,
                    {
                      borderColor: nc.border,
                      backgroundColor:
                        currentTier === t
                          ? nc.todayAccent + "20"
                          : nc.backgroundCard,
                    },
                  ]}
                  onPress={() => devOverrideTier(currentTier === t ? null : t)}
                >
                  <Text
                    style={[
                      styles.devButtonText,
                      {
                        color:
                          currentTier === t ? nc.todayAccent : nc.textMuted,
                      },
                    ]}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.devButtons, { marginTop: 6 }]}>
              {(["monthly", "annual", "lifetime"] as const).map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[
                    styles.devButton,
                    {
                      borderColor: nc.border,
                      backgroundColor:
                        currentBilling === b
                          ? nc.success + "20"
                          : nc.backgroundCard,
                    },
                  ]}
                  onPress={() =>
                    devOverrideBilling(currentBilling === b ? null : b)
                  }
                >
                  <Text
                    style={[
                      styles.devButtonText,
                      {
                        color: currentBilling === b ? nc.success : nc.textMuted,
                      },
                    ]}
                  >
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Legal */}
        <Text style={[styles.legal, { color: nc.textLight }]}>
          L'abonnement se renouvelle automatiquement sauf annulation au moins
          24h avant la fin de la periode. Le paiement est debite via votre
          compte App Store ou Google Play.
        </Text>
      </ScrollView>

      <InfoModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onClose={() =>
          setModalConfig({ visible: false, title: "", message: "" })
        }
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
    borderRadius: 14,
    padding: 5,
    gap: 6,
    marginBottom: 20,
  },
  cycleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    zIndex: 1,
  },
  tabIndicator: {
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  cycleButtonText: { fontSize: 14, fontWeight: "700" },
  tabLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  activeTabDot: { width: 6, height: 6, borderRadius: 3 },
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
  manageButton: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  manageButtonText: { fontSize: 14, fontWeight: "500" },
  linksRow: { alignItems: "center", gap: 16, paddingVertical: 16 },
  devSection: { marginTop: 20, alignItems: "center" },
  devLabel: { fontSize: 11, marginBottom: 6 },
  devButtons: { flexDirection: "row", gap: 8 },
  devButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  devButtonText: { fontSize: 12, fontWeight: "600" },
  restoreButton: { alignItems: "center", paddingVertical: 4 },
  restoreText: { fontSize: 14, fontWeight: "500" },
  faqDivider: { borderTopWidth: 1, marginVertical: 16 },
  faqSection: { marginTop: 4 },
  faqTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  faqItem: { borderBottomWidth: 1, paddingVertical: 14 },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqQuestion: { fontSize: 15, fontWeight: "600", flex: 1, paddingRight: 8 },
  faqAnswer: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  legal: { fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 20 },
});
