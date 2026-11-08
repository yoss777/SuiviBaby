/* eslint-disable import/first */
// Vignettes de la galerie : fond neutre tant que l'image charge.
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/utils/photoStorage", () => ({
  getAuthenticatedPhotoSource: jest.fn(async () => ({ uri: "https://x/y.jpg" })),
  isLocalPhotoUri: (r: string) => r.startsWith("file:"),
  isStoragePathPhotoRef: (r: string) => r.startsWith("children/"),
  normalizePhotoRef: (r: string) => r,
}));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: any) => <View testID="expo-image" {...props} /> };
});

import { act, render } from "@testing-library/react-native";
import React from "react";

import { PhotoImage } from "@/components/ui/PhotoImage";
import { getNeutralColors } from "@/constants/dashboardColors";

const bg = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean)).backgroundColor;
const NEUTRAL = getNeutralColors("light").borderLight;

describe("PhotoImage vignette", () => {
  it("fond neutre tant que l'image charge, retiré une fois chargée", () => {
    const { getByTestId } = render(
      <PhotoImage photoRef="file:///a.jpg" thumbnail style={{ width: 10, height: 10 }} />,
    );
    const img = getByTestId("expo-image");
    expect(bg(img)).toBe(NEUTRAL);
    act(() => img.props.onLoad({}));
    expect(bg(getByTestId("expo-image"))).toBeUndefined();
  });

  it("fond neutre pendant la résolution de la source (pas de cadre vide)", async () => {
    const { toJSON, findByTestId } = render(
      <PhotoImage photoRef="children/c/photo.jpg" style={{ width: 10, height: 10 }} thumbnail />,
    );
    // Avant résolution : une vue neutre ; après : l'image, encore sur fond neutre.
    expect(JSON.stringify(toJSON())).toContain(NEUTRAL);
    const img = await findByTestId("expo-image");
    expect(bg(img)).toBe(NEUTRAL);
  });

  it("sans thumbnail : aucun fond ajouté", () => {
    const { getByTestId } = render(<PhotoImage photoRef="file:///a.jpg" style={{ width: 10 }} />);
    expect(bg(getByTestId("expo-image"))).toBeUndefined();
  });
});
