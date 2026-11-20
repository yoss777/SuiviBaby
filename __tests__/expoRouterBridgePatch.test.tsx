// Correctif patches/expo-router+58.0.30.patch : sur Android, quand l'activité
// est recréée (taille de police changée app ouverte), React Native monte le
// nouvel arbre AVANT de démonter l'ancien. Sans le correctif, le démontage de
// l'ancien débranchait la navigation du nouveau : écran de démarrage figé, ou
// « The imperative router is unavailable before the first render has finished ».
import { render } from "@testing-library/react-native";
import React from "react";

const { ImperativeRoutingQueueBridge } = jest.requireActual(
  "expo-router/build/global-state/routingQueueContext",
);
const { router } = jest.requireActual("expo-router/build/global-state/router");

function bridge(enqueue: jest.Mock) {
  return <ImperativeRoutingQueueBridge enqueue={enqueue} setTransitionMode={jest.fn()} />;
}

describe("expo-router : recréation de l'activité Android", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("nouvel arbre monté avant le démontage de l'ancien : la navigation reste branchée sur le nouveau", () => {
    const oldEnqueue = jest.fn();
    const newEnqueue = jest.fn();
    const oldRoot = render(bridge(oldEnqueue));
    const newRoot = render(bridge(newEnqueue));
    oldRoot.unmount();
    expect(() => router.replace("/baby/home")).not.toThrow();
    expect(newEnqueue).toHaveBeenCalled();
    expect(oldEnqueue).not.toHaveBeenCalled();
    newRoot.unmount();
  });

  it("dernier arbre démonté : navigation débranchée comme avant", () => {
    const root = render(bridge(jest.fn()));
    root.unmount();
    expect(() => router.replace("/baby/home")).toThrow(/before the first render/);
  });
});
