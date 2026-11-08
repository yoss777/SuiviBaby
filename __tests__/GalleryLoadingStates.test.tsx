/* eslint-disable import/first */
// Galerie : squelette tant que la première page n'est pas chargée, message
// « aucun souvenir » seulement une fois chargée sans photo.
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));

import { render } from "@testing-library/react-native";
import React from "react";
import { Animated } from "react-native";

import { GalleryGridSkeleton } from "@/components/gallery/GalleryGridSkeleton";
import {
  GRID_GAP,
  NUM_COLUMNS,
  getGalleryViewState,
  getThumbSize,
} from "@/components/gallery/galleryGrid";
import { __setReduceMotionForTests } from "@/utils/motion";

const base = { loaded: true, loadError: false, eventCount: 0, photoCount: 0, hasMore: false };

describe("getGalleryViewState", () => {
  it("avant la première page : squelette (jamais le message vide)", () => {
    expect(getGalleryViewState({ ...base, loaded: false })).toBe("loading");
  });
  it("chargée sans photo : message vide", () => {
    expect(getGalleryViewState(base)).toBe("empty");
  });
  it("chargée avec des photos : grille", () => {
    expect(getGalleryViewState({ ...base, eventCount: 3, photoCount: 3 })).toBe("grid");
  });
  it("première page sans photo mais suite à lire : squelette, pas de message trompeur", () => {
    expect(getGalleryViewState({ ...base, eventCount: 60, hasMore: true })).toBe("loading");
  });
  it("la lecture de la suite a échoué : on ne reste pas bloqué sur le squelette", () => {
    expect(getGalleryViewState({ ...base, eventCount: 60, hasMore: true, loadMoreFailed: true })).toBe("empty");
  });
  it("erreur de chargement sans données : écran d'erreur", () => {
    expect(getGalleryViewState({ ...base, loadError: true })).toBe("error");
  });
});

describe("GalleryGridSkeleton", () => {
  afterEach(() => jest.restoreAllMocks());

  it("a les mêmes colonnes et tailles de cellules que la grille", () => {
    const { getAllByTestId } = render(<GalleryGridSkeleton rows={2} thumbSize={getThumbSize(360)} />);
    const cells = getAllByTestId("gallery-skeleton-cell");
    expect(cells).toHaveLength(2 * NUM_COLUMNS);
    const size = (360 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
    const flat = Object.assign({}, ...[cells[0].props.style].flat());
    expect(flat.width).toBe(size);
    expect(flat.height).toBe(size);
  });

  it("est annoncé comme chargement en cours", () => {
    const { getByLabelText } = render(<GalleryGridSkeleton rows={1} />);
    expect(getByLabelText("Chargement des photos")).toBeTruthy();
  });

  it("anime le reflet, sauf avec « Réduire les animations »", () => {
    const start = jest.fn();
    jest.spyOn(Animated, "loop").mockReturnValue({ start, stop: jest.fn(), reset: jest.fn() } as any);
    __setReduceMotionForTests(false);
    render(<GalleryGridSkeleton rows={1} />);
    expect(start).toHaveBeenCalled();

    start.mockClear();
    __setReduceMotionForTests(true);
    render(<GalleryGridSkeleton rows={1} />);
    expect(start).not.toHaveBeenCalled();
    __setReduceMotionForTests(false);
  });
});
