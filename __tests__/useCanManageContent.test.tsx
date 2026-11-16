// Droits de saisie pendant le chargement : le cache ne vaut que pour le bébé
// qu'il concerne (après un changement de bébé, un Proche n'est jamais traité
// en parent le temps du chargement).
import { renderHook } from "@testing-library/react-native";

import { useCanManageContentState } from "@/hooks/useCanManageContent";
import { clearPermissionsCache, setPermissionsCache } from "@/services/userPreferencesCache";

let mockActiveChildId = "a";
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ firebaseUser: { uid: "u1" } }) }));
jest.mock("@/contexts/BabyContext", () => ({ useBaby: () => ({ activeChild: { id: mockActiveChildId } }) }));
jest.mock("@/hooks/useChildPermissions", () => ({ useChildPermissions: () => ({ loading: true, role: null }) }));

afterEach(() => clearPermissionsCache());

it("droits en cache du même bébé : utilisés pendant le chargement", () => {
  mockActiveChildId = "a";
  setPermissionsCache({ childId: "a", role: "owner", canManageContent: true });
  expect(renderHook(() => useCanManageContentState()).result.current).toEqual({ canManage: true, known: true });
});

it("droits en cache d'un autre bébé : ignorés, on attend le chargement", () => {
  mockActiveChildId = "b";
  setPermissionsCache({ childId: "a", role: "owner", canManageContent: true });
  expect(renderHook(() => useCanManageContentState()).result.current).toEqual({ canManage: false, known: false });
});
