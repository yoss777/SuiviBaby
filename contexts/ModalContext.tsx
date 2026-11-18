import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChoiceModal, type ChoiceButton } from "@/components/ui/ChoiceModal";
import { ConfirmModal, DESTRUCTIVE_COLOR } from "@/components/ui/ConfirmModal";
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
  /**
   * Identifiant de la question : tant qu'une modale de même clé est affichée
   * ou en file, un nouvel appel est ignoré (taps répétés, rappels d'un
   * sélecteur). Une modale à clé n'est jamais remplacée : la suivante attend.
   */
  key?: string;
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
      onCancel?: () => void;
    }
  | {
      type: "choice";
      title: string;
      message: React.ReactNode;
      buttons: ChoiceButton[];
      onCancel?: () => void;
    }
  | null;

type ModalContent = Exclude<ModalState, null>;
type QueuedModal = { content: ModalContent; protectedModal: boolean; key?: string };

type ModalContextType = {
  showAlert: (
    title: string,
    message?: React.ReactNode,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => void;
  showConfirm: (
    title: string,
    message: React.ReactNode,
    onConfirm: () => void,
    /** Par défaut : bouton rouge « Supprimer ». `destructive: false` = couleur normale. */
    opts?: { confirmText?: string; destructive?: boolean },
  ) => void;
  hide: () => void;
  /** Vrai si une modale du contexte est affichée (lecture ponctuelle, non réactive). */
  hasOpenModal: () => boolean;
  /**
   * Notifie à chaque affichage d'une modale protégée (alerte santé). Sert aux
   * écrans qui affichent une modale décorative : l'alerte santé passe toujours
   * en premier. Renvoie la fonction de désinscription.
   */
  subscribeProtectedModal: (listener: () => void) => () => void;
};

const isErrorTitle = (value: string) =>
  /erreur|error|echec|failed|❌/i.test(value);

const ModalContext = createContext<ModalContextType | undefined>(undefined);

type ModalHostState = {
  modalState: ModalState;
  modalProtected: boolean;
  closeCurrent: (expected?: ModalContent) => void;
};
const ModalStateContext = createContext<ModalHostState | null>(null);

// Point d'entrée pour le code hors composant (menus de ligne, liens profonds) :
// même fenêtre que useModal().showAlert, enregistrée par le provider monté.
let globalShowAlert: ModalContextType["showAlert"] | null = null;
export const showAppAlert: ModalContextType["showAlert"] = (...args) => {
  if (globalShowAlert) globalShowAlert(...args);
  else if (__DEV__) console.warn("showAppAlert appelé sans ModalProvider monté");
};
let globalHasOpenModal: (() => boolean) | null = null;
/** Une fenêtre de l'app est-elle ouverte ? (hors composant, ex. retour auto du widget) */
export const isAppModalOpen = (): boolean => globalHasOpenModal?.() ?? false;

export const ModalProvider = ({
  children,
  renderHost = true,
}: {
  children: React.ReactNode;
  /** false : les fenêtres sont affichées par un <ModalHost /> monté ailleurs. */
  renderHost?: boolean;
}) => {
  const [modalState, setModalState] = useState<ModalState>(null);
  // Alerte protégée affichée : le bouton retour Android ne la ferme pas.
  const [modalProtected, setModalProtected] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Modale protégée en cours + file d'attente (refs : lues à chaque appel, sans
  // dépendre du dernier rendu).
  const currentProtectedRef = useRef(false);
  const queueRef = useRef<QueuedModal[]>([]);
  const currentRef = useRef<ModalContent | null>(null);
  // Clé de la modale affichée ; une modale « collante » (choix ou clé) n'est
  // jamais remplacée, la suivante passe en file.
  const currentKeyRef = useRef<string | undefined>(undefined);
  const currentStickyRef = useRef(false);
  const protectedListenersRef = useRef<Set<() => void>>(new Set());

  // Couleurs lues par ref : les fonctions du contexte restent stables même si
  // le thème change (les consommateurs « actions » ne se re-rendent pas).

  const present = useCallback((content: ModalContent, protectedModal: boolean, key?: string) => {
    if (
      key &&
      (currentKeyRef.current === key || queueRef.current.some((q) => q.key === key))
    ) {
      return;
    }
    const sticky = currentStickyRef.current && !protectedModal;
    if (currentProtectedRef.current || sticky) {
      queueRef.current.push({ content, protectedModal, key });
      return;
    }
    currentProtectedRef.current = protectedModal;
    currentRef.current = content;
    currentKeyRef.current = key;
    currentStickyRef.current = content.type === "choice" || key !== undefined;
    setModalProtected(protectedModal);
    setModalState(content);
    if (protectedModal) protectedListenersRef.current.forEach((listener) => listener());
  }, []);

  const hasOpenModal = useCallback(() => currentRef.current !== null, []);

  const subscribeProtectedModal = useCallback((listener: () => void) => {
    protectedListenersRef.current.add(listener);
    return () => {
      protectedListenersRef.current.delete(listener);
    };
  }, []);

  // Ferme la modale en cours puis affiche la suivante de la file, s'il y en a une.
  // `expected` : ne ferme que cette modale (un bouton appelé après qu'un
  // callback a déjà affiché autre chose ne doit pas fermer la nouvelle).
  const closeCurrent = useCallback((expected?: ModalContent) => {
    if (expected && currentRef.current !== expected) return;
    const next = queueRef.current.shift();
    currentProtectedRef.current = next?.protectedModal ?? false;
    currentRef.current = next?.content ?? null;
    currentKeyRef.current = next?.key;
    currentStickyRef.current =
      !!next && (next.content.type === "choice" || next.key !== undefined);
    setModalProtected(next?.protectedModal ?? false);
    setModalState(next?.content ?? null);
    if (next?.protectedModal) protectedListenersRef.current.forEach((listener) => listener());
  }, []);


  const showAlert = useCallback((
    title: string,
    message: React.ReactNode = "",
    buttons: AlertButton[] = [],
    options: AlertOptions = {},
  ) => {
    const isProtected = options.dismissible === false || options.callEmergency === true;
    const cancelOf = buttons.find((btn) => btn.style === "cancel");
    if (buttons.length >= 3) {
      present(
        {
          type: "choice",
          title,
          message,
          buttons: buttons.map((btn) => ({
            text: btn.text || "OK",
            style: btn.style,
            onPress: btn.onPress ?? (() => {}),
          })),
          onCancel: cancelOf?.onPress,
        },
        isProtected,
        options.key,
      );
      return;
    }
    if (buttons.length <= 1) {
      const onlyButton = buttons[0];
      const isError = isErrorTitle(title);
      present(
        {
          type: "info",
          title,
          message,
          confirmText: onlyButton?.text ?? "OK",
          confirmButtonColor: isError ? DESTRUCTIVE_COLOR : undefined,
          confirmTextColor: isError ? "#fff" : undefined,
          onConfirm: onlyButton?.onPress,
        },
        isProtected,
        options.key,
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
        confirmButtonColor: confirmIsDestructive ? DESTRUCTIVE_COLOR : undefined,
        confirmTextColor: confirmIsDestructive ? "#fff" : undefined,
        onConfirm: confirmButton?.onPress,
        // Comme l'alerte native : « Annuler », le retour Android et le fond
        // exécutent l'action du bouton d'annulation.
        onCancel: cancelButton?.onPress,
      },
      isProtected,
      options.key,
    );
  }, [present]);

  // hide() public : ne ferme jamais une alerte protégée (seuls ses boutons le font).
  const hide = useCallback(() => {
    if (currentProtectedRef.current) return;
    closeCurrent();
  }, []);

  const showConfirm = useCallback(
    (
      title: string,
      message: React.ReactNode,
      onConfirm: () => void,
      opts?: { confirmText?: string; destructive?: boolean },
    ) => {
      const destructive = opts?.destructive !== false;
      present(
        {
          type: "confirm",
          title,
          message,
          confirmText: opts?.confirmText ?? "Supprimer",
          cancelText: "Annuler",
          confirmButtonColor: destructive ? DESTRUCTIVE_COLOR : undefined,
          confirmTextColor: destructive ? "#fff" : undefined,
          onConfirm,
        },
        false,
      );
    },
    [present],
  );

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
  }, [modalState, closeCurrent]);

  useEffect(() => {
    globalShowAlert = showAlert;
    globalHasOpenModal = hasOpenModal;
    return () => {
      if (globalShowAlert === showAlert) globalShowAlert = null;
      if (globalHasOpenModal === hasOpenModal) globalHasOpenModal = null;
    };
  }, [showAlert, hasOpenModal]);

  // Valeur stable : ne contient que des actions (l'état de la modale reste local).
  const value = useMemo(
    () => ({
      showAlert,
      showConfirm,
      hide,
      hasOpenModal,
      subscribeProtectedModal,
    }),
    [showAlert, showConfirm, hide, hasOpenModal, subscribeProtectedModal],
  );

  const hostState = useMemo(
    () => ({ modalState, modalProtected, closeCurrent }),
    [modalState, modalProtected, closeCurrent],
  );

  return (
    <ModalContext.Provider value={value}>
      <ModalStateContext.Provider value={hostState}>
        {children}
        {renderHost && <ModalHost />}
      </ModalStateContext.Provider>
    </ModalContext.Provider>
  );
};

/**
 * Affichage des fenêtres. Monté par le provider (tests, usage simple) ou,
 * dans l'app, sous le thème de l'app (`renderHost={false}` + `<ModalHost />`
 * dans RootLayout) : les fenêtres suivent alors le thème choisi dans l'app,
 * pas celui du téléphone. Les couleurs sont résolues ici, à l'affichage.
 */
export function ModalHost() {
  const host = useContext(ModalStateContext);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  // Texte posé sur l'aplat tint : token du thème (blanc en clair, foncé en
  // sombre, où le blanc ne fait que 2.54:1 sur #60a5fa).
  const tintTextColor = colors.onTint;
  if (!host) return null;
  const { modalState, modalProtected, closeCurrent } = host;
  return (
    <>
      {modalState?.type === "info" && (
        <InfoModal
          visible={true}
          title={modalState.title}
          message={modalState.message}
          confirmText={modalState.confirmText}
          confirmButtonColor={modalState.confirmButtonColor ?? colors.tint}
          confirmTextColor={modalState.confirmTextColor ?? tintTextColor}
          dismissOnBack={!modalProtected}
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
          confirmButtonColor={modalState.confirmButtonColor ?? colors.tint}
          confirmTextColor={modalState.confirmTextColor ?? tintTextColor}
          dismissOnBack={!modalProtected}
          onCancel={() => {
            closeCurrent(modalState);
            modalState.onCancel?.();
          }}
          onConfirm={() => {
            closeCurrent(modalState);
            modalState.onConfirm?.();
          }}
        />
      )}
      {modalState?.type === "choice" && (
        <ChoiceModal
          visible={true}
          title={modalState.title}
          message={modalState.message}
          tintColor={colors.tint}
          onTintColor={tintTextColor}
          dismissOnBack={!modalProtected}
          buttons={modalState.buttons.map((btn) => ({
            ...btn,
            onPress: () => {
              closeCurrent(modalState);
              btn.onPress();
            },
          }))}
          onCancel={() => {
            closeCurrent(modalState);
            modalState.onCancel?.();
          }}
        />
      )}
    </>
  );
}


// Même valeur que useModal : toutes les fonctions sont stables (le contexte ne
// porte aucun état), un consommateur qui n'appelle que des actions ne se
// re-rend donc pas quand une modale s'ouvre ou se ferme.
export const useModalActions = () => useModal();

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
