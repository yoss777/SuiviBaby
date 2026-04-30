// app/(drawer)/baby/(tabs)/home/HomeSmartContent.tsx
//
// "Insights + correlations + upcoming milestones" block under the daily
// summary on the home tab. Three lists rendered conditionally:
//   - data-driven insights filtered by the user's dismissed-set
//   - cross-data correlations filtered by the same dismissed-set
//   - the next milestones banner (carousel)
//
// Pure presentational layer: no Firestore, no listeners, no state of
// its own. The orchestration component owns dismissedInsightIds /
// smartContent / activeChild and just hands them in.
//
// Extracted from home.tsx (S3-T1d).

import {
  InsightCard,
  MilestoneTimelineCard,
} from "@/components/suivibaby/dashboard";
import type { useSmartContent } from "@/hooks/useSmartContent";
import React from "react";
import { View } from "react-native";

type SmartContent = ReturnType<typeof useSmartContent>;

interface StaggeredCardProps {
  children: React.ReactNode;
}

interface HomeSmartContentProps {
  smartContent: SmartContent;
  dismissedInsightIds: Set<string>;
  hasAnyTodayData: boolean;
  activeChildBirthDate: string | undefined;
  onOpenInsightTip: (tipId: string) => void;
  /** InsightCard.onDismiss receives insight.id, not the whole insight. */
  onDismissInsight: (insightId: string) => void;
  onShowMilestonesModal: () => void;
  colorScheme: "light" | "dark";
  StaggeredCard: React.ComponentType<StaggeredCardProps>;
}

export function HomeSmartContent({
  smartContent,
  dismissedInsightIds,
  hasAnyTodayData,
  activeChildBirthDate,
  onOpenInsightTip,
  onDismissInsight,
  onShowMilestonesModal,
  colorScheme,
  StaggeredCard,
}: HomeSmartContentProps) {
  return (
    <View style={{ paddingHorizontal: 20, gap: 12, marginBottom: 12 }}>
      {/* Data-driven insights */}
      {hasAnyTodayData &&
        smartContent.insights
          .filter((ins) => !dismissedInsightIds.has(ins.id))
          .map((insight) => (
            <StaggeredCard key={insight.id}>
              <InsightCard
                insight={insight}
                onDismiss={onDismissInsight}
                onLearnMore={(ins) => {
                  if (ins.relatedTipId) {
                    onOpenInsightTip(ins.relatedTipId);
                  }
                }}
                colorScheme={colorScheme}
              />
            </StaggeredCard>
          ))}

      {/* Cross-data correlations */}
      {hasAnyTodayData &&
        smartContent.correlations
          .filter((corr) => !dismissedInsightIds.has(corr.id))
          .map((corr) => (
            <StaggeredCard key={corr.id}>
              <InsightCard
                insight={corr}
                onDismiss={onDismissInsight}
                colorScheme={colorScheme}
              />
            </StaggeredCard>
          ))}

      {/* Upcoming milestones */}
      {smartContent.upcomingMilestones.length > 0 && (
        <StaggeredCard>
          <MilestoneTimelineCard
            milestones={smartContent.upcomingMilestones}
            ageWeeks={
              activeChildBirthDate
                ? Math.floor(
                    (Date.now() -
                      new Date(
                        activeChildBirthDate.split("/").reverse().join("-"),
                      ).getTime()) /
                      (7 * 24 * 60 * 60 * 1000),
                  )
                : 0
            }
            onViewAll={onShowMilestonesModal}
            colorScheme={colorScheme}
          />
        </StaggeredCard>
      )}
    </View>
  );
}
