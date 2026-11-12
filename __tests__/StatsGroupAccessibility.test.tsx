import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  StatsGroup,
  buildStatsGroupA11yLabel,
} from "@/components/suivibaby/dashboard/StatsGroup";
import { getNeutralColors } from "@/constants/dashboardColors";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

const NBSP = " ";

describe("StatsGroup : accessibilité et lisibilité (P1-3, P1-4, P2-11)", () => {
  const now = new Date("2026-11-12T12:00:00");
  const lastTs = now.getTime() - 125 * 60_000;

  const renderGroup = (over: Partial<React.ComponentProps<typeof StatsGroup>> = {}) =>
    render(
      <StatsGroup
        title="Alimentation"
        icon="utensils"
        color="#E8785A"
        summary="5 repas"
        timeSinceLabel="Dernier repas"
        timeSinceTimestamp={lastTs}
        currentTime={now}
        items={[
          {
            key: "biberons",
            label: "Biberons",
            value: 3,
            unit: "fois",
            icon: "baby-bottle",
            color: "#E8C45A",
            lastTimestamp: lastTs,
            onPress: jest.fn(),
          },
        ]}
        {...over}
      />,
    );

  it("le libellé lu inclut le résumé et « il y a 2 h 05 »", () => {
    const { getByRole } = renderGroup();
    const header = getByRole("button", { name: /Alimentation/ });
    expect(header.props.accessibilityLabel).toBe(
      `Alimentation, 5 repas, Dernier repas il y a 2${NBSP}h${NBSP}05`,
    );
    expect(header.props.accessibilityState).toEqual({ expanded: false });
  });

  it("un seul élément accessible : le chevron n'est plus un bouton séparé", () => {
    const { queryByLabelText, getByRole } = renderGroup();
    expect(queryByLabelText("Développer")).toBeNull();
    const header = getByRole("button", { name: /Alimentation/ });
    fireEvent.press(header);
    expect(getByRole("button", { name: /Alimentation/ }).props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it("les chiffres dépliés sont en textStrong, la couleur de catégorie reste sur l'icône", () => {
    const { getByText, getByRole } = renderGroup({ defaultExpanded: true });
    const value = getByText("3");
    expect(StyleSheet.flatten(value.props.style).color).toBe(
      getNeutralColors("light").textStrong,
    );
    expect(getByRole("button", { name: /Biberons/ }).props.accessibilityLabel).toBe(
      `Biberons, 3 fois, il y a 2${NBSP}h${NBSP}05`,
    );
  });

  it("buildStatsGroupA11yLabel sans « il y a »", () => {
    expect(buildStatsGroupA11yLabel({ title: "Santé", summary: "0 change" })).toBe(
      "Santé, 0 change",
    );
  });
});
