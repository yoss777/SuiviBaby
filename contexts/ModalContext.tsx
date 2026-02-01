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

type ModalContextType = {
  showAlert: (title: string, message?: React.ReactNode, buttons?: AlertButton[]) => void;
  showConfirm: (title: string, message: React.ReactNode, onConfirm: () => void) => void;
  hide: () => void;
};

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [modalState, setModalState] = useState<ModalState>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backgroundColor = colors.background;
  const textColor = colors.text;
  const tintTextColor =
    colors.tint === "#fff" ? "#1b1b1b" : "#fff";
  const isErrorTitle = (value: string) =>
    /erreur|error|echec|failed|❌/i.test(value);

  const showAlert = (title: string, message: React.ReactNode = "", buttons: AlertButton[] = []) => {
    if (buttons.length <= 1) {
      const onlyButton = buttons[0];
      const isError = isErrorTitle(title);
      setModalState({
        type: "info",
        title,
        message,
        confirmText: onlyButton?.text ?? "OK",
        confirmButtonColor: isError ? "#dc3545" : colors.tint,
        confirmTextColor: isError ? "#fff" : tintTextColor,
        onConfirm: onlyButton?.onPress,
      });
      return;
    }

    const cancelButton =
      buttons.find((btn) => btn.style === "cancel") ?? buttons[0];
    const confirmButton =
      buttons.find((btn) => btn !== cancelButton) ?? buttons[1];
    const confirmIsDestructive = confirmButton?.style === "destructive";

    setModalState({
      type: "confirm",
      title,
      message,
      confirmText: confirmButton?.text || "Confirmer",
      cancelText: cancelButton?.text || "Annuler",
      confirmButtonColor: confirmIsDestructive ? "#dc3545" : colors.tint,
      confirmTextColor: "#fff",
      onConfirm: confirmButton?.onPress,
    });
  };

  const hide = () => setModalState(null);

  const showConfirm = (title: string, message: React.ReactNode, onConfirm: () => void) => {
    setModalState({
      type: "confirm",
      title,
      message,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      confirmButtonColor: "#dc3545",
      confirmTextColor: "#fff",
      onConfirm,
    });
  };

  useEffect(() => {
    if (!modalState || modalState.type !== "info") return;
    if (modalState.confirmText !== "") return;

    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
    }

    autoDismissRef.current = setTimeout(() => {
      hide();
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
          onConfirm={modalState.onConfirm}
          onClose={hide}
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
          onCancel={hide}
          onConfirm={() => {
            modalState.onConfirm?.();
            hide();
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
