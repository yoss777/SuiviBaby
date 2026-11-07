import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { AllergiesEditor } from "@/components/forms/AllergiesEditor";

function Harness({
  initial = [] as string[],
  readOnly = false,
  spy = jest.fn(),
}) {
  const [v, setV] = useState(initial);
  return (
    <AllergiesEditor
      value={v}
      onChange={(n) => {
        spy(n);
        setV(n);
      }}
      colorScheme="light"
      readOnly={readOnly}
    />
  );
}

describe("AllergiesEditor", () => {
  it("coche et décoche une suggestion (sémantique checkbox)", () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    fireEvent.press(screen.getByRole("checkbox", { name: "Lait" }));
    expect(spy).toHaveBeenLastCalledWith(["Lait"]);
    expect(screen.getByRole("checkbox", { name: "Lait", checked: true })).toBeTruthy();
    fireEvent.press(screen.getByRole("checkbox", { name: "Lait" }));
    expect(spy).toHaveBeenLastCalledWith([]);
  });

  it("ajoute une allergie libre, puis la retire", () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText("Autre allergie"), "  Kiwi ");
    fireEvent.press(screen.getByRole("button", { name: "Ajouter l'allergie" }));
    expect(screen.getByRole("button", { name: "Retirer Kiwi" })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retirer Kiwi" }));
    expect(screen.queryByRole("button", { name: "Retirer Kiwi" })).toBeNull();
  });

  it("refuse un doublon insensible à la casse avec un message", () => {
    const spy = jest.fn();
    render(<Harness initial={["Kiwi"]} spy={spy} />);
    fireEvent.changeText(screen.getByLabelText("Autre allergie"), "kiwi");
    fireEvent.press(screen.getByRole("button", { name: "Ajouter l'allergie" }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Cette allergie est déjà dans la liste.")).toBeTruthy();
  });

  it("limite à 15 entrées et 40 caractères", () => {
    const full = Array.from({ length: 15 }, (_, i) => `a${i}`);
    const spy = jest.fn();
    render(<Harness initial={full} spy={spy} />);
    expect(screen.getByLabelText("Autre allergie").props.maxLength).toBe(40);
    fireEvent.changeText(screen.getByLabelText("Autre allergie"), "de plus");
    fireEvent.press(screen.getByRole("button", { name: "Ajouter l'allergie" }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Maximum 15 allergies.")).toBeTruthy();
  });

  it("lecture seule (Proche) : texte sans aucun contrôle", () => {
    render(<Harness initial={["Lait", "Kiwi"]} readOnly />);
    expect(screen.getByText("Lait, Kiwi")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByLabelText("Autre allergie")).toBeNull();
  });

  it("lecture seule sans allergie : mention explicite", () => {
    render(<Harness readOnly />);
    expect(screen.getByText("Aucune renseignée")).toBeTruthy();
  });
});
