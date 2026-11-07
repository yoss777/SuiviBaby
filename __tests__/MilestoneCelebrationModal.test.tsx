// Modale de célébration : accessibilité, mouvement réduit, partage.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo, Animated, Share, StyleSheet } from "react-native";

import { MilestoneCelebrationModal } from "@/components/suivibaby/MilestoneCelebrationModal";
import type { MilestoneCelebration } from "@/services/milestoneCelebrationService";
import { __setReduceMotionForTests } from "@/utils/motion";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Medium: "medium" },
}));

const milestone: MilestoneCelebration = {
  id: "tracking_30d",
  type: "tracking_duration",
  title: "1 mois de suivi !",
  message: "Vous suivez votre bébé depuis 1 mois. Bravo pour votre régularité !",
  emoji: "🎉",
  sharePhrase: "a 1 mois de suivi",
  isPremium: false,
  achievedAt: "2026-11-07T10:00:00.000Z",
};

afterEach(() => {
  __setReduceMotionForTests(false);
  jest.restoreAllMocks();
});

describe("MilestoneCelebrationModal", () => {
  it("ne rend rien sans jalon", () => {
    render(<MilestoneCelebrationModal milestone={null} onDismiss={() => {}} />);
    expect(screen.queryByText("Fermer")).toBeNull();
  });

  it("annonce le titre aux lecteurs d'écran et le marque comme en-tête", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={() => {}} />);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("1 mois de suivi !"));
    expect(screen.getByRole("header", { name: "1 mois de suivi !" })).toBeTruthy();
  });

  it("boutons Fermer et Partager étiquetés, cibles d'au moins 44 pt", () => {
    render(<MilestoneCelebrationModal milestone={milestone} childName="Léa" onDismiss={() => {}} />);
    for (const label of ["Fermer", "Partager"]) {
      const btn = screen.getByRole("button", { name: label });
      const style = StyleSheet.flatten(btn.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it("texte secondaire en textLight et corps ≥ 12", () => {
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={() => {}} />);
    const msg = StyleSheet.flatten(screen.getByText(milestone.message).props.style);
    expect(msg.color).toBe("#6b7280");
    expect(msg.fontSize).toBeGreaterThanOrEqual(12);
  });

  it("avec animations normales : ressort et fondu", () => {
    const spring = jest.spyOn(Animated, "spring");
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={() => {}} />);
    expect(spring).toHaveBeenCalled();
  });

  it("mouvement réduit : ni ressort ni échelle, rendu immédiat", () => {
    __setReduceMotionForTests(true);
    const spring = jest.spyOn(Animated, "spring");
    const timing = jest.spyOn(Animated, "timing");
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={() => {}} />);
    expect(spring).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });

  it("mouvement réduit : Fermer ferme tout de suite", () => {
    __setReduceMotionForTests(true);
    const onDismiss = jest.fn();
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={onDismiss} />);
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Fermer appelle onDismiss après le fondu (animations normales)", () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={onDismiss} />);
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("Partager envoie une phrase française avec le prénom, sans chiffre de santé", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any);
    render(<MilestoneCelebrationModal milestone={milestone} childName="Léa" onDismiss={() => {}} />);
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Partager" }));
    });
    expect(share).toHaveBeenCalledWith({ message: "Léa a 1 mois de suivi sur SuiviBaby 🎉" });
  });

  it("n'écrit plus dans le stockage : le marquage se fait à l'affichage", () => {
    const AsyncStorage = require("@react-native-async-storage/async-storage");
    AsyncStorage.setItem.mockClear();
    __setReduceMotionForTests(true);
    render(<MilestoneCelebrationModal milestone={milestone} onDismiss={() => {}} />);
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
