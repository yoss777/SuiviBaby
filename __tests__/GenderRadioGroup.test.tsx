import { fireEvent, render, screen } from "@testing-library/react-native";

import { StyleSheet } from "react-native";

import {
  GENDER_COLORS,
  GENDER_SELECTED_TEXT,
  GenderRadioGroup,
} from "@/components/forms/GenderRadioGroup";

jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");

describe("GenderRadioGroup", () => {
  it("expose un groupe radio avec deux options dont l'état coché suit la valeur", () => {
    render(<GenderRadioGroup value="female" onChange={jest.fn()} colorScheme="light" />);

    // Le groupe n'est pas un élément accessible unique (sinon VoiceOver
    // fusionnerait les deux radios) : getByRole ne le voit pas, on lit ses props.
    const group = screen.UNSAFE_getByProps({ accessibilityRole: "radiogroup" });
    expect(group.props.accessibilityLabel).toBe("Sexe");
    expect(screen.getByRole("radio", { name: "Fille", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Garçon", checked: false })).toBeTruthy();
  });

  it("appelle onChange avec la valeur choisie", () => {
    const onChange = jest.fn();
    render(<GenderRadioGroup value="" onChange={onChange} colorScheme="light" />);

    fireEvent.press(screen.getByRole("radio", { name: "Garçon" }));
    expect(onChange).toHaveBeenCalledWith("male");
  });

  it("n'appelle pas onChange quand il est désactivé", () => {
    const onChange = jest.fn();
    render(<GenderRadioGroup value="" onChange={onChange} colorScheme="light" disabled />);

    fireEvent.press(screen.getByRole("radio", { name: "Fille" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ["female", "Fille"],
    ["male", "Garçon"],
  ] as const)(
    "option %s cochée : aplat et texte issus des paires vérifiées",
    (value, label) => {
      render(<GenderRadioGroup value={value} onChange={jest.fn()} colorScheme="light" />);

      const radio = screen.getByRole("radio", { name: label });
      expect(StyleSheet.flatten(radio.props.style).backgroundColor).toBe(
        GENDER_COLORS[value],
      );
      expect(StyleSheet.flatten(screen.getByText(label).props.style).color).toBe(
        GENDER_SELECTED_TEXT[value],
      );
    },
  );
});
