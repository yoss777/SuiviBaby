import { render } from "@testing-library/react-native";
import React from "react";

import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";

// Capture les props de chaque ligne de sélection (le sélecteur natif n'est pas rendu ici).
const rows: Record<string, any> = {};
jest.mock("@/components/ui/DateTimePickerRow", () => ({
  DateTimePickerRow: (props: any) => {
    rows[props.label] = props;
    return null;
  },
}));

const at = (h: number, m: number, s = 0) => new Date(2026, 10, 17, h, m, s);

// Sieste démarrée à 21:13:42, fin bornée à 23:59, pas de date de fin.
const renderNap = (onEndBeforeStart = jest.fn(), onHeureFinChange = jest.fn()) => {
  render(
    <DateTimeSectionRow
      colorScheme="light"
      chrono
      heureDebut={at(21, 13, 42)}
      heureFin={at(22, 0)}
      onHeureDebutChange={jest.fn()}
      onHeureFinChange={onHeureFinChange}
      showEndDate={false}
      heureFinMaximumDate={at(23, 59)}
      onEndBeforeStart={onEndBeforeStart}
    />,
  );
  return { onEndBeforeStart, onHeureFinChange };
};

describe("DateTimeSectionRow : fin de sieste avant le début (gel iOS)", () => {
  it("pendant le défilement : aucune question, la valeur invalide est ignorée", () => {
    const { onEndBeforeStart, onHeureFinChange } = renderNap();
    rows.Fin.onChange(at(0, 30));
    expect(onEndBeforeStart).not.toHaveBeenCalled();
    expect(onHeureFinChange).not.toHaveBeenCalled();
  });

  it("à la validation (roulette fermée) : la question est posée", () => {
    const { onEndBeforeStart } = renderNap();
    rows.Fin.onCommit(at(0, 30));
    expect(onEndBeforeStart).toHaveBeenCalledTimes(1);
  });

  it("la minute du début ne compte pas comme « avant le début » (secondes ignorées)", () => {
    const { onEndBeforeStart, onHeureFinChange } = renderNap();
    rows.Fin.onChange(at(21, 13));
    rows.Fin.onCommit(at(21, 13));
    expect(onEndBeforeStart).not.toHaveBeenCalled();
    expect(onHeureFinChange).toHaveBeenCalled();
  });

  it("23:59 est accepté sans question", () => {
    const { onEndBeforeStart, onHeureFinChange } = renderNap();
    rows.Fin.onChange(at(23, 59));
    rows.Fin.onCommit(at(23, 59));
    expect(onEndBeforeStart).not.toHaveBeenCalled();
    expect(onHeureFinChange).toHaveBeenLastCalledWith(at(23, 59));
  });

  it("minimum de la roulette ramené à la minute (jamais au-delà du maximum 23:59)", () => {
    render(
      <DateTimeSectionRow
        colorScheme="light"
        chrono
        heureDebut={at(23, 59, 30)}
        heureFin={at(23, 59)}
        onHeureDebutChange={jest.fn()}
        onHeureFinChange={jest.fn()}
        showEndDate={false}
        heureFinMaximumDate={at(23, 59)}
        onEndBeforeStart={jest.fn()}
      />,
    );
    expect(rows.Fin.minimumDate.getTime()).toBeLessThanOrEqual(rows.Fin.maximumDate.getTime());
  });
});
