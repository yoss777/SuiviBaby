// S7.0 / S7.7 : mesures et garde-fous du journal.
//  - horloge à la minute partagée : seules les lignes « en cours » se re-rendent ;
//  - formateurs en cache : mêmes libellés que toLocale*String ;
//  - fenêtre élargie : seule la tranche plus ancienne est relue.
import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AppState } from "react-native";
import {
  __ongoingClockListenerCount,
  useOngoingClock,
} from "@/hooks/useOngoingClock";
import { olderSliceBounds, windowStart } from "@/utils/chronoWindow";

describe("useOngoingClock : rendus par minute", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 7, 10, 0, 30));
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(() => ({ remove: jest.fn() }) as any);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("un tick de minute ne re-rend que les lignes en cours (50 lignes dont 1 en cours)", () => {
    const renders = { ongoing: 0, other: 0 };
    const Row = React.memo(function Row({ ongoing }: { ongoing: boolean }) {
      const now = useOngoingClock(ongoing);
      if (ongoing) renders.ongoing++;
      else renders.other++;
      return <Text>{ongoing ? now : "x"}</Text>;
    });
    render(
      <>
        {Array.from({ length: 50 }, (_, i) => (
          <Row key={i} ongoing={i === 0} />
        ))}
      </>,
    );
    expect(__ongoingClockListenerCount()).toBe(1);
    const before = { ...renders };
    for (let m = 0; m < 5; m++) {
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
    }
    // Avant S7.7 : 5 ticks x 50 lignes = 250 rendus de lignes.
    expect(renders.other - before.other).toBe(0);
    expect(renders.ongoing - before.ongoing).toBe(5);
  });

  it("premier rendu après une longue pause sans abonné : heure courante, pas l'ancienne", () => {
    const values: number[] = [];
    const Row = () => {
      const v = useOngoingClock(true);
      values.push(v);
      return <Text>{v}</Text>;
    };
    const first = render(<Row />);
    first.unmount();
    values.length = 0;
    jest.setSystemTime(new Date(2026, 10, 7, 14, 0, 0));
    const second = render(<Row />);
    // Tout premier rendu (avant l'abonnement qui recale l'heure).
    expect(Math.abs(values[0] - Date.now())).toBeLessThan(1000);
    second.unmount();
  });

  it("se désabonne au démontage (plus de minuteur)", () => {
    const Row = () => <Text>{useOngoingClock(true)}</Text>;
    const { unmount } = render(<Row />);
    expect(__ongoingClockListenerCount()).toBe(1);
    unmount();
    expect(__ongoingClockListenerCount()).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("formateurs en cache", () => {
  const d = new Date(2026, 10, 7, 9, 5);
  it("donnent les mêmes libellés que toLocale*String", () => {
    expect(
      new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d),
    ).toBe(d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    const o = { weekday: "long", day: "2-digit", month: "long" } as const;
    expect(new Intl.DateTimeFormat("fr-FR", o).format(d)).toBe(d.toLocaleDateString("fr-FR", o));
  });
});

describe("fenêtre du journal", () => {
  const now = new Date(2026, 10, 7, 15, 0);
  it("windowStart : 14 jours aujourd'hui compris", () => {
    expect(windowStart(14, now)).toEqual(new Date(2026, 9, 25));
  });
  it("olderSliceBounds : rien si la fenêtre ne grandit pas", () => {
    expect(olderSliceBounds(14, 14, now)).toBeNull();
    expect(olderSliceBounds(30, 7, now)).toBeNull();
  });
  it("olderSliceBounds : 14 -> 30 ne couvre que les jours 15 à 30, sans chevauchement", () => {
    const b = olderSliceBounds(14, 30, now)!;
    expect(b.depuis).toEqual(windowStart(30, now));
    expect(b.jusqu.getTime()).toBe(windowStart(14, now).getTime() - 1);
    // Jours lus : 30 - 14 = 16 sur 30 (53 %), contre 30 sur 30 avant.
    const days = Math.round((b.jusqu.getTime() - b.depuis.getTime()) / 86_400_000);
    expect(days).toBe(16);
  });
});
