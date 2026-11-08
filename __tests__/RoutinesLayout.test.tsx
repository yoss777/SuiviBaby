import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { PromenadeWidget } from "@/components/suivibaby/dashboard/PromenadeWidget";
import { SleepWidget } from "@/components/suivibaby/dashboard/SleepWidget";
import { QuickAddRow } from "@/components/ui/QuickAddRow";

jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "dark" }));

describe("Bouton « Terminer » des cartes en cours", () => {
  it("SleepWidget : le libellé reste sur une ligne", () => {
    render(
      <SleepWidget
        isActive
        isNap={false}
        elapsedMinutes={120}
        startTime="03:51"
        onStartSleep={jest.fn()}
        onStopSleep={jest.fn()}
        onEditSleep={jest.fn()}
        colorScheme="dark"
      />,
    );
    const label = screen.getByText("Terminer");
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.minimumFontScale).toBe(0.8);
    expect(StyleSheet.flatten(label.props.style).fontSize).toBeGreaterThanOrEqual(12);
  });

  it("PromenadeWidget : le libellé reste sur une ligne", () => {
    render(
      <PromenadeWidget
        isActive
        elapsedMinutes={15}
        startTime="10:00"
        onStart={jest.fn()}
        onStop={jest.fn()}
        onEdit={jest.fn()}
        colorScheme="dark"
      />,
    );
    const label = screen.getByText("Terminer");
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe("QuickAddRow (ajouts rapides sous les filtres)", () => {
  const onNap = jest.fn();
  const items = [
    { key: "sieste", label: "Sieste", accessibilityLabel: "Ajouter une sieste", icon: <Text>i</Text>, onPress: onNap },
    { key: "nuit", label: "Nuit", accessibilityLabel: "Ajouter un sommeil nocturne", icon: <Text>i</Text>, onPress: jest.fn() },
    { key: "bain", label: "Bain", accessibilityLabel: "Ajouter un bain", icon: <Text>i</Text>, onPress: jest.fn() },
    { key: "nez", label: "Nez", accessibilityLabel: "Ajouter un nettoyage de nez", icon: <Text>i</Text>, onPress: jest.fn() },
  ];

  it("rend les modèles dans une rangée dédiée, accessibles et en un tap", () => {
    render(<QuickAddRow items={items} />);
    const row = screen.getByTestId("quick-add-row");
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe("row");

    const buttons = within(row).getAllByRole("button");
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(
      items.map((i) => i.accessibilityLabel),
    );

    fireEvent.press(screen.getByLabelText("Ajouter une sieste"));
    expect(onNap).toHaveBeenCalledTimes(1);
  });

  it("garde des cibles de 44 pt et des libellés sur une ligne", () => {
    render(<QuickAddRow items={items} />);
    const button = screen.getByTestId("quick-add-sieste");
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const label = screen.getByText("Sieste");
    expect(label.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(label.props.style).fontSize).toBeGreaterThanOrEqual(12);
  });
});
