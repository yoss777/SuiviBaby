import { act, render, screen } from "@testing-library/react-native";

import { ChartA11ySummary } from "@/components/suivibaby/ChartA11ySummary";
import {
  buildDayEntries,
  formatMinutesSpoken,
  getWeekDayLabels,
  pluralize,
} from "@/utils/chartA11y";

describe("chartA11y", () => {
  it("libelle les sept jours de la semaine en toutes lettres", () => {
    // Lundi 3 novembre 2025, heure locale
    const labels = getWeekDayLabels(new Date(2025, 10, 3).getTime());
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe("Lundi 3 novembre");
    expect(labels[1]).toBe("Mardi 4 novembre");
    expect(labels[6]).toBe("Dimanche 9 novembre");
  });

  it("passe au mois suivant en fin de mois", () => {
    const labels = getWeekDayLabels(new Date(2025, 9, 27).getTime());
    expect(labels[5]).toBe("Samedi 1 novembre");
  });

  it("construit la phrase par jour", () => {
    expect(
      buildDayEntries(["Mardi 4 novembre"], [`${pluralize(6, "repas", "repas")}, 720 ml`]),
    ).toEqual(["Mardi 4 novembre : 6 repas, 720 ml"]);
  });

  it("formate les durées à voix haute", () => {
    expect(formatMinutesSpoken(450)).toBe("7 heures 30");
    expect(formatMinutesSpoken(60)).toBe("1 heure");
    expect(formatMinutesSpoken(0)).toBe("0 minute");
    expect(formatMinutesSpoken(45)).toBe("45 minutes");
  });
});

describe("ChartA11ySummary", () => {
  const entries = ["Lundi 3 novembre : 2 repas", "Mardi 4 novembre : 6 repas, 720 ml"];

  it("annonce le premier jour et expose les actions suivant/précédent", () => {
    render(<ChartA11ySummary title="Graphique des repas" entries={entries} />);

    const chart = screen.getByRole("adjustable");
    expect(chart.props.accessibilityValue).toEqual({
      text: `${entries[0]}, jour 1 sur 2`,
    });
    // Libellé stable, sans mode d'emploi du geste (fourni par le lecteur d'écran)
    expect(chart.props.accessibilityLabel).toBe("Graphique des repas");
    expect(chart.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      "increment",
      "decrement",
    ]);
  });

  it("parcourt les jours avec increment et decrement, sans dépasser les bornes", () => {
    render(<ChartA11ySummary title="Graphique des repas" entries={entries} />);

    // fireEvent ignore les vues en pointerEvents="none" : on appelle le
    // gestionnaire comme le ferait le lecteur d'écran.
    const trigger = (actionName: string) =>
      act(() => {
        screen
          .getByRole("adjustable")
          .props.onAccessibilityAction({ nativeEvent: { actionName } });
      });
    const currentText = () =>
      screen.getByRole("adjustable").props.accessibilityValue.text;

    trigger("increment");
    expect(currentText()).toBe(`${entries[1]}, jour 2 sur 2`);

    trigger("increment");
    expect(currentText()).toBe(`${entries[1]}, jour 2 sur 2`);

    trigger("decrement");
    expect(currentText()).toBe(`${entries[0]}, jour 1 sur 2`);
  });

  it("revient au premier jour quand la période change (même nombre de jours)", () => {
    const { rerender } = render(
      <ChartA11ySummary title="Graphique des repas" entries={entries} periodKey={1} />,
    );
    act(() => {
      screen
        .getByRole("adjustable")
        .props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } });
    });
    expect(screen.getByRole("adjustable").props.accessibilityValue.text).toContain(
      "jour 2 sur 2",
    );

    const nextWeek = ["Lundi 10 novembre : 1 repas", "Mardi 11 novembre : 3 repas"];
    rerender(
      <ChartA11ySummary title="Graphique des repas" entries={nextWeek} periodKey={2} />,
    );
    expect(screen.getByRole("adjustable").props.accessibilityValue.text).toBe(
      `${nextWeek[0]}, jour 1 sur 2`,
    );
  });

  it("sans données : pas de « Jour 1 sur 0 » ni d'élément ajustable", () => {
    render(<ChartA11ySummary title="Graphique des repas" entries={[]} />);

    expect(screen.queryByRole("adjustable")).toBeNull();
    const node = screen.getByLabelText("Graphique des repas. Aucune donnée pour cette période.");
    expect(node.props.accessibilityLabel).not.toMatch(/sur 0/);
  });
});
