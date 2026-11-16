// Filet de l'effacement à distance : plus aucun bébé accessible → widget vidé.
import { render } from "@testing-library/react-native";
import React from "react";

import { WidgetOrphanGuard } from "@/components/widget/WidgetOrphanGuard";

const mockClear = jest.fn();
let mockBaby = { children: [] as { id: string }[], childrenLoaded: true, status: "ready" };
jest.mock("@/services/widgetSync", () => ({ clearNowWidget: () => mockClear() }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }));
jest.mock("@/contexts/BabyContext", () => ({ useBaby: () => mockBaby }));

beforeEach(() => mockClear.mockClear());

it("liste chargée, confirmée et vide : widget vidé une fois", () => {
  mockBaby = { children: [], childrenLoaded: true, status: "ready" };
  const { rerender } = render(<WidgetOrphanGuard />);
  rerender(<WidgetOrphanGuard />);
  expect(mockClear).toHaveBeenCalledTimes(1);
});

it("pas encore confirmée (cache, chargement) ou bébés présents : rien", () => {
  mockBaby = { children: [], childrenLoaded: true, status: "degraded" };
  render(<WidgetOrphanGuard />);
  mockBaby = { children: [], childrenLoaded: false, status: "loading" };
  render(<WidgetOrphanGuard />);
  mockBaby = { children: [{ id: "c1" }], childrenLoaded: true, status: "ready" };
  render(<WidgetOrphanGuard />);
  expect(mockClear).not.toHaveBeenCalled();
});
