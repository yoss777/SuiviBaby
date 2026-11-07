import { fireEvent, render, screen } from "@testing-library/react-native";

import { GenderRadioGroup } from "@/components/forms/GenderRadioGroup";

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
});
