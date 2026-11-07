import { act, renderHook } from "@testing-library/react-native";

import { useVoiceCommand } from "@/hooks/useVoiceCommand";

let mockActiveChild: { id: string; birthDate?: string } = { id: "child-1" };
const mockVoiceService = {
  requestPermissions: jest.fn(async () => true),
  startRecording: jest.fn(async () => undefined),
  stopRecording: jest.fn(async () => "file:///tmp/audio.m4a"),
  cancelRecording: jest.fn(async () => undefined),
  deleteRecording: jest.fn(async () => undefined),
};
const mockExecuteCommand = jest.fn(async () => true);
let mockParseResolve: ((value: unknown) => void) | null = null;

jest.mock("@/config/firebase", () => ({ auth: { currentUser: null } }));
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ activeChild: mockActiveChild }),
}));
jest.mock("@/contexts/ModalContext", () => ({
  useModal: () => ({ showAlert: jest.fn() }),
}));
jest.mock("@/utils/temperatureAlertDialog", () => ({
  showTemperatureAlertDialog: jest.fn(),
}));
jest.mock("@/utils/permissions", () => ({ getUserChildAccess: jest.fn() }));
jest.mock("@/utils/eventPermissions", () => ({ canManageEvents: () => true }));
jest.mock("@/services/voiceCommandService", () => ({
  __esModule: true,
  default: {
    requestPermissions: (...a: unknown[]) => (mockVoiceService.requestPermissions as any)(...a),
    startRecording: (...a: unknown[]) => (mockVoiceService.startRecording as any)(...a),
    stopRecording: (...a: unknown[]) => (mockVoiceService.stopRecording as any)(...a),
    cancelRecording: (...a: unknown[]) => (mockVoiceService.cancelRecording as any)(...a),
    deleteRecording: (...a: unknown[]) => (mockVoiceService.deleteRecording as any)(...a),
  },
}));
jest.mock("@/services/voice/recorder", () => ({
  VoicePermissionDeniedError: class extends Error {},
}));
jest.mock("@/services/voiceEventCreator", () => ({
  findEventByIdentifier: jest.fn(),
  lookupFailureMessage: jest.fn(),
  executeCommand: (...a: unknown[]) => (mockExecuteCommand as any)(...a),
  executeMultipleCommands: jest.fn(),
  isAmbiguous: () => false,
}));
jest.mock("@/hooks/useVoiceParser", () => ({
  transcribeAudio: jest.fn(async () => ({ text: "biberon 150ml", error: null })),
  // Analyse suspendue : résolue à la main par le test.
  parseCommandsSmart: jest.fn(
    () =>
      new Promise((resolve) => {
        mockParseResolve = resolve;
      }),
  ),
  formatConfirmationMessage: () => "Biberon 150ml",
  formatEventDetails: () => "",
}));

const bottleCommand = { type: "biberon", action: "add", quantite: 150 };

describe("useVoiceCommand", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveChild = { id: "child-1" };
    mockParseResolve = null;
  });

  it("n'affiche aucune confirmation pour l'ancien enfant si l'enfant change pendant l'analyse", async () => {
    const { result, rerender } = renderHook(() => useVoiceCommand(mockActiveChild.id, true));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.processVoiceCommand("biberon 150ml");
    });

    mockActiveChild = { id: "child-2" };
    rerender({});

    await act(async () => {
      mockParseResolve?.({ commands: [bottleCommand], truncated: false, source: "regex" });
      await pending;
    });

    expect(result.current.confirmModal.visible).toBe(false);
    expect(result.current.pendingCommand).toBeNull();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("ferme la confirmation en attente au changement d'enfant et ne crée rien", async () => {
    const { result, rerender } = renderHook(() => useVoiceCommand(mockActiveChild.id, true));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.processVoiceCommand("biberon 150ml");
    });
    await act(async () => {
      mockParseResolve?.({ commands: [bottleCommand], truncated: false, source: "regex" });
      await pending;
    });
    expect(result.current.confirmModal.visible).toBe(true);
    const staleConfirm = result.current.confirmModal.onConfirm;

    mockActiveChild = { id: "child-2" };
    rerender({});

    expect(result.current.confirmModal.visible).toBe(false);
    expect(result.current.pendingCommand).toBeNull();
    // Même un onConfirm conservé par l'appelant ne doit rien exécuter.
    await act(async () => {
      await staleConfirm?.();
    });
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("arrête l'enregistrement et supprime l'audio temporaire au démontage", async () => {
    const { result, unmount } = renderHook(() => useVoiceCommand("child-1", false));

    await act(async () => {
      await result.current.startVoiceCommand();
    });
    expect(result.current.isRecording).toBe(true);

    unmount();
    // VoiceCommandService.cancelRecording arrête le micro ET supprime le fichier.
    expect(mockVoiceService.cancelRecording).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien au démontage s'il n'y a pas d'enregistrement", () => {
    const { unmount } = renderHook(() => useVoiceCommand("child-1", false));
    unmount();
    expect(mockVoiceService.cancelRecording).not.toHaveBeenCalled();
  });

  it("annule l'enregistrement au changement d'enfant", async () => {
    const { result, rerender } = renderHook(() => useVoiceCommand(mockActiveChild.id, false));
    await act(async () => {
      await result.current.startVoiceCommand();
    });

    mockActiveChild = { id: "child-2" };
    rerender({});

    expect(mockVoiceService.cancelRecording).toHaveBeenCalled();
  });
});
