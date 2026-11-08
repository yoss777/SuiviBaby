/* eslint-disable import/first */
// Écran d'export : ouverture légère (décomptes serveur), avertissements avant
// export, hors ligne sans fichier, rechargement uniquement sur changement utile.
const mockLoadCounts = jest.fn();
const mockCollect = jest.fn();
const mockPending = jest.fn();
const mockPrepare = jest.fn();
const mockShare = jest.fn();
const mockDelete = jest.fn();
const mockWrite = jest.fn();
const mockReplace = jest.fn();
const mockPrefs = jest.fn();
let mockFocusCallbacks: Array<() => void> = [];
let mockParams: Record<string, string> = {};
let mockChildren: Array<{ id: string; name: string; birthDate?: string }> = [];

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null, FontAwesome6: () => null }));
jest.mock("@expo/vector-icons/FontAwesome6", () => ({ __esModule: true, default: () => null }));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("expo-file-system", () => ({
  writeAsStringAsync: (...a: unknown[]) => mockWrite(...a),
  EncodingType: { UTF8: "utf8" },
}));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(cb);
        return cb();
      }, [cb]);
    },
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: jest.fn() }),
  };
});
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn(), showActionToast: jest.fn() }),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userName: "Test", email: "t@t.fr", user: { uid: "u1" } }),
}));
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ children: mockChildren, loading: false }),
}));
jest.mock("@/services/exportCollector", () => ({
  ...jest.requireActual("@/services/exportCollector"),
  loadChildExportCounts: (...a: unknown[]) => mockLoadCounts(...a),
  collectChildExportData: (...a: unknown[]) => mockCollect(...a),
}));
jest.mock("@/services/offlineQueueService", () => ({
  getPendingChildIds: () => mockPending(),
  isOnline: () => Promise.resolve(true),
}));
jest.mock("@/services/userPreferencesService", () => ({
  obtenirPreferences: (...a: unknown[]) => mockPrefs(...a),
}));
jest.mock("@/services/tempShareService", () => ({
  deleteTempFile: (...a: unknown[]) => mockDelete(...a),
  prepareExportFile: (...a: unknown[]) => mockPrepare(...a),
  shareTempFile: (...a: unknown[]) => mockShare(...a),
}));

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { InteractionManager } from "react-native";

import ExportScreen from "@/app/settings/export";
import { getExportEventTypes } from "@/services/eventTypeSupport";
import { ExportOfflineError } from "@/services/exportCollector";

const counts = (role: string, events: Record<string, number>, likes = 0, comments = 0) => ({
  role,
  events: Object.fromEntries(getExportEventTypes().map((t) => [t, events[t] ?? 0])),
  likes,
  comments,
});
const collected = (over: Record<string, unknown> = {}) => ({
  role: "owner",
  profile: {},
  events: [{ id: "e1", type: "biberon", userId: "u1", date: "2026-01-01" }],
  likes: [],
  comments: [],
  truncated: false,
  ...over,
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
const open = async (ui = <ExportScreen />) => {
  const view = render(ui);
  await flush();
  await flush();
  return view;
};
const pressExport = async () => {
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Exporter les données"));
  });
  await flush();
  await flush();
};

describe("ExportScreen : flux", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallbacks = [];
    mockParams = {};
    mockChildren = [{ id: "c1", name: "Léo" }];
    jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation(((cb: () => void) => {
      cb();
      return { cancel: jest.fn() };
    }) as never);
    mockPrefs.mockResolvedValue(null);
    mockLoadCounts.mockResolvedValue(counts("owner", { biberon: 3 }, 1, 2));
    mockCollect.mockResolvedValue(collected());
    mockPending.mockResolvedValue(new Set());
    mockPrepare.mockResolvedValue("file:///cache/exports/x.json");
    mockWrite.mockResolvedValue(undefined);
    mockShare.mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe("ouverture légère", () => {
    it("affiche les décomptes serveur par enfant, sans lire les données complètes", async () => {
      await open();
      expect(mockLoadCounts).toHaveBeenCalledWith("c1", "u1");
      expect(mockCollect).not.toHaveBeenCalled();
      expect(screen.getByText("3/3 événements (tout le suivi)")).toBeTruthy();
      expect(screen.getByText("3 interactions (vos likes et commentaires)")).toBeTruthy();
    });

    it("hors ligne : « — », message de connexion et Exporter désactivé", async () => {
      mockLoadCounts.mockRejectedValue(new ExportOfflineError());
      await open();
      expect(screen.getByText("— événements (vos saisies)")).toBeTruthy();
      expect(screen.getByText("Connexion requise pour exporter vos données")).toBeTruthy();
      expect(screen.getByLabelText("Exporter les données").props.accessibilityState?.disabled).toBe(true);
      await pressExport();
      expect(mockCollect).not.toHaveBeenCalled();
    });

    it("Proche : portée « vos saisies » et nouveau texte d'information", async () => {
      mockLoadCounts.mockResolvedValue(counts("viewer", { biberon: 2 }));
      await open();
      expect(screen.getByText("2/2 événements (vos saisies)")).toBeTruthy();
      expect(
        screen.getByText(
          "Pour un enfant dont vous êtes proche, l'export contient vos likes, vos commentaires et les événements que vous avez saisis. Le reste du suivi peut être exporté par un parent de l'enfant.",
        ),
      ).toBeTruthy();
    });

    it("Proche partout : les événements restent exportables (aucun type masqué)", async () => {
      mockLoadCounts.mockResolvedValue(counts("viewer", { biberon: 2, solide: 1 }));
      await open();
      expect(screen.getByLabelText("Sélectionner Solide")).toBeTruthy();
      expect(screen.getByLabelText("Exporter les données").props.accessibilityState?.disabled).toBeFalsy();
    });
  });

  describe("rechargement des décomptes", () => {
    it("pas de rechargement quand le document enfant change sans changer les identifiants", async () => {
      const { rerender } = await open();
      expect(mockLoadCounts).toHaveBeenCalledTimes(1);
      mockChildren = [{ id: "c1", name: "Léo (renommé)", birthDate: "01/01/2026" }];
      rerender(<ExportScreen />);
      await flush();
      expect(mockLoadCounts).toHaveBeenCalledTimes(1);
    });

    it("rechargement quand un enfant s'ajoute", async () => {
      const { rerender } = await open();
      mockChildren = [...mockChildren, { id: "c2", name: "Mia" }];
      rerender(<ExportScreen />);
      await flush();
      await flush();
      expect(mockLoadCounts).toHaveBeenCalledWith("c2", "u1");
    });

    it("rechargement au retour sur l'écran (focus), pas au premier focus", async () => {
      await open();
      expect(mockLoadCounts).toHaveBeenCalledTimes(1);
      await act(async () => {
        mockFocusCallbacks.forEach((cb) => cb());
      });
      await flush();
      await flush();
      expect(mockLoadCounts).toHaveBeenCalledTimes(2);
    });
  });

  describe("export", () => {
    it("lit les données complètes seulement au clic, puis affiche les nombres réellement exportés", async () => {
      await open();
      await pressExport();
      expect(mockCollect).toHaveBeenCalledTimes(1);
      expect(mockCollect.mock.calls[0][0]).toBe("c1");
      expect(mockCollect.mock.calls[0][1]).toBe("u1");
      expect(mockWrite).toHaveBeenCalledTimes(1);
      const json = JSON.parse(mockWrite.mock.calls[0][1]);
      expect(json.data.children[0].events).toHaveLength(1);
      expect(screen.getByText("Export terminé")).toBeTruthy();
    });

    it("hors ligne pendant l'export : message clair, aucun fichier écrit", async () => {
      mockCollect.mockRejectedValue(new ExportOfflineError());
      await open();
      await pressExport();
      expect(screen.getByText("Connexion requise pour exporter vos données")).toBeTruthy();
      expect(mockPrepare).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockShare).not.toHaveBeenCalled();
    });

    it("échec d'écriture : le fichier temporaire est supprimé", async () => {
      mockWrite.mockRejectedValue(new Error("disque plein"));
      await open();
      await pressExport();
      expect(mockDelete).toHaveBeenCalledWith("file:///cache/exports/x.json");
      expect(mockShare).not.toHaveBeenCalled();
    });

    it("saisies en attente : avertissement, annuler n'exporte rien", async () => {
      mockPending.mockResolvedValue(new Set(["c1"]));
      await open();
      await pressExport();
      expect(
        screen.getByText(
          "Des saisies sont en attente d'envoi : elles ne figureront pas dans l'export. Reconnectez-vous et réessayez.",
        ),
      ).toBeTruthy();
      expect(mockCollect).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(screen.getByText("Annuler"));
      });
      await flush();
      expect(mockCollect).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("saisies en attente : continuer exporte", async () => {
      mockPending.mockResolvedValue(new Set(["c1"]));
      await open();
      await pressExport();
      await act(async () => {
        fireEvent.press(screen.getByText("Exporter quand même"));
      });
      await flush();
      await flush();
      expect(mockCollect).toHaveBeenCalledTimes(1);
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it("saisies en attente d'un enfant non sélectionné : pas d'avertissement", async () => {
      mockPending.mockResolvedValue(new Set(["autre"]));
      await open();
      await pressExport();
      expect(mockCollect).toHaveBeenCalledTimes(1);
    });

    it("plafond dur dépassé selon les décomptes : avertissement explicite avant export", async () => {
      mockLoadCounts.mockResolvedValue(counts("owner", { biberon: 100001 }));
      await open();
      await pressExport();
      expect(screen.getByText(/100 000 éléments/)).toBeTruthy();
      expect(mockCollect).not.toHaveBeenCalled();
    });

    it("plafond atteint pendant la lecture : mention dans le fichier", async () => {
      mockCollect.mockResolvedValue(collected({ truncated: true }));
      await open();
      await pressExport();
      const json = JSON.parse(mockWrite.mock.calls[0][1]);
      expect(json.notes.truncated).toEqual(expect.stringContaining("incomplet"));
    });
  });

  describe("suppression de compte (afterDelete=1)", () => {
    beforeEach(() => {
      mockParams = { afterDelete: "1" };
    });

    it("hors ligne : aucun fichier, message de connexion", async () => {
      mockCollect.mockRejectedValue(new ExportOfflineError());
      await open();
      expect(mockLoadCounts).not.toHaveBeenCalled();
      expect(mockPrepare).not.toHaveBeenCalled();
      expect(screen.getByText("Connexion requise pour exporter vos données")).toBeTruthy();
    });

    it("exporte tous les enfants et tous les types", async () => {
      await open();
      expect(mockCollect).toHaveBeenCalledTimes(1);
      expect(mockCollect.mock.calls[0][2]).toEqual({
        eventTypes: getExportEventTypes(),
        includeLikes: true,
        includeComments: true,
      });
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it("« Supprimer le compte » navigue une seule fois vers settings?delete=1", async () => {
      await open();
      await act(async () => {
        fireEvent.press(screen.getByText("Supprimer le compte"));
      });
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/(drawer)/settings?delete=1");
    });

    it("fermer simplement navigue une seule fois vers settings", async () => {
      await open();
      await act(async () => {
        fireEvent.press(screen.getByText("Fermer et revenir aux paramètres"));
      });
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/(drawer)/settings");
    });
  });
});
