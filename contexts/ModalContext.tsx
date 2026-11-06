import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AlertButtonStyle = "default" | "cancel" | "destructive";

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
};

// Alerte santé protégée : affichée avec `dismissible: false` ou avec une action
// d'appel du 15. Aucune autre modale ne peut la remplacer : les suivantes sont
// mises en file et s'affichent à sa fermeture.
export type AlertOptions = {
  /** false : modale protégée, jamais remplacée par une modale ultérieure. */
  dismissible?: boolean;
  /** true : la modale propose d'appeler le 15, donc protégée aussi. */
  callEmergency?: boolean;
};

type ModalState =
  | {
      type: "info";
      title: string;
      message: React.ReactNode;
      confirmText: string;
      confirmButtonColor?: string;
      confirmTextColor?: string;
      onConfirm?: () => void;
    }
  | {
      type: "confirm";
      title: string;
      message: React.ReactNode;
      confirmText: string;
      cancelText: string;
      confirmButtonColor?: string;
      confirmTextColor?: string;
      onConfirm?: () => void;
    }
  | null;

type ModalContent = Exclude<ModalState, null>;
type QueuedModal = { content: ModalContent; protectedModal: boolean };

type ModalContextType = {
  showAlert: (
    title: string,
    message?: React.ReactNode,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => void;
  showConfirm: (title: string, message: React.ReactNode, onConfirm: () => void) => void;
  hide: () => void;
};

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [modalState, setModalState] = useState<ModalState>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Modale protégée en cours + file d'attente (refs : lues à chaque appel, sans
  // dépendre du dernier rendu).
  const currentProtectedRef = useRef(false);
  const queueRef = useRef<QueuedModal[]>([]);
  const currentRef = useRef<ModalContent | null>(null);

  const present = (content: ModalContent, protectedModal: boolean) => {
    if (currentProtectedRef.current) {
      queueRef.current.push({ content, protectedModal });
      return;
    }
    currentProtectedRef.current = protectedModal;
    currentRef.current = content;
    setModalState(content);
  };

  // Ferme la modale en cours puis affiche la suivante de la file, s'il y en a une.
  // `expected` : ne ferme que cette modale (un bouton appelé après qu'un
  // callback a déjà affiché autre chose ne doit pas fermer la nouvelle).
  const closeCurrent = (expected?: ModalContent) => {
    if (expected && currentRef.current !== expected) return;
    const next = queueRef.current.shift();
    currentProtectedRef.current = next?.protectedModal ?? false;
    currentRef.current = next?.content ?? null;
    setModalState(next?.content ?? null);
  };

  const backgroundColor = colors.background;
  const textColor = colors.text;
  const tintTextColor =
    colors.tint === "#fff" ? "#1b1b1b" : "#fff";
  const isErrorTitle = (value: string) =>
    /erreur|error|echec|failed|❌/i.test(value);

  const showAlert = (
    title: string,
    message: React.ReactNode = "",
    buttons: AlertButton[] = [],
    options: AlertOptions = {},
  ) => {
    const isProtected = options.dismissible === false || options.callEmergency === true;
    if (buttons.length <= 1) {
      const onlyButton = buttons[0];
      const isError = isErrorTitle(title);
      present(
        {
          type: "info",
          title,
          message,
          confirmText: onlyButton?.text ?? "OK",
          confirmButtonColor: isError ? "#dc3545" : colors.tint,
          confirmTextColor: isError ? "#fff" : tintTextColor,
          onConfirm: onlyButton?.onPress,
        },
        isProtected,
      );
      return;
    }

    const cancelButton =
      buttons.find((btn) => btn.style === "cancel") ?? buttons[0];
    const confirmButton =
      buttons.find((btn) => btn !== cancelButton) ?? buttons[1];
    const confirmIsDestructive = confirmButton?.style === "destructive";

    present(
      {
        type: "confirm",
        title,
        message,
        confirmText: confirmButton?.text || "Confirmer",
        cancelText: cancelButton?.text || "Annuler",
        confirmButtonColor: confirmIsDestructive ? "#dc3545" : colors.tint,
        confirmTextColor: "#fff",
        onConfirm: confirmButton?.onPress,
      },
      isProtected,
    );
  };

  // hide() public : ne ferme jamais une alerte protégée (seuls ses boutons le font).
  const hide = () => {
    if (currentProtectedRef.current) return;
    currentRef.current = null;
    setModalState(null);
  };

  const showConfirm = (title: string, message: React.ReactNode, onConfirm: () => void) => {
    present(
      {
        type: "confirm",
        title,
        message,
        confirmText: "Supprimer",
        cancelText: "Annuler",
        confirmButtonColor: "#dc3545",
        confirmTextColor: "#fff",
        onConfirm,
      },
      false,
    );
  };

  useEffect(() => {
    if (!modalState || modalState.type !== "info") return;
    if (modalState.confirmText !== "") return;

    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
    }

    autoDismissRef.current = setTimeout(() => {
      closeCurrent(modalState);
    }, 2000);

    return () => {
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current);
        autoDismissRef.current = null;
      }
    };
  }, [modalState]);

  const value = useMemo(
    () => ({
      showAlert,
      showConfirm,
      hide,
    }),
    [showAlert, showConfirm],
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      {modalState?.type === "info" && (
        <InfoModal
          visible={true}
          title={modalState.title}
          message={modalState.message}
          confirmText={modalState.confirmText}
          confirmButtonColor={modalState.confirmButtonColor ?? colors.tint}
          confirmTextColor={modalState.confirmTextColor ?? tintTextColor}
          backgroundColor={backgroundColor}
          textColor={textColor}
          onConfirm={() => {
            // Fermer d'abord : un callback qui affiche une autre modale ne la
            // verra pas effacée par la fermeture.
            closeCurrent(modalState);
            modalState.onConfirm?.();
          }}
          onClose={() => closeCurrent(modalState)}
        />
      )}
      {modalState?.type === "confirm" && (
        <ConfirmModal
          visible={true}
          title={modalState.title}
          message={modalState.message}
          confirmText={modalState.confirmText}
          cancelText={modalState.cancelText}
          confirmButtonColor={modalState.confirmButtonColor}
          confirmTextColor={modalState.confirmTextColor ?? tintTextColor}
          cancelButtonColor={`${colors.tabIconDefault}20`}
          cancelTextColor={colors.text}
          backgroundColor={backgroundColor}
          textColor={textColor}
          onCancel={() => closeCurrent(modalState)}
          onConfirm={() => {
            closeCurrent(modalState);
            modalState.onConfirm?.();
          }}
        />
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
