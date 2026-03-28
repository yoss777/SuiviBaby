// contexts/AuthContext.tsx
import { auth, db } from "@/config/firebase";
import { useModal } from "@/contexts/ModalContext";
import { cancelAllReminders } from "@/services/localNotificationService";
import { registerPushToken, removePushTokens } from "@/services/pushTokenService";
import { onSignOut as onOfflineQueueSignOut, startAutoSync } from "@/services/offlineQueueService";
import { clearTodayEventsCache } from "@/services/todayEventsCache";
import {
  canUserAccessApp,
  createPatientUser,
  updateLastLogin,
} from "@/services/userService";
import type { User, UserType } from "@/types/user";
import Constants from "expo-constants";
import {
  User as FirebaseUser,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { Platform } from "react-native";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  userName: string | null;
  email: string | null;
  userType: UserType | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  userName: null,
  email: null,
  userType: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  userName: string | null;
  email: string | null;
  userType: UserType | null;
  loading: boolean;
}

type AuthAction =
  | { type: "SET_USER_DATA"; payload: { firebaseUser: FirebaseUser; user: User } }
  | { type: "CLEAR_USER" }
  | { type: "SET_LOADING"; payload: boolean };

const initialState: AuthState = {
  firebaseUser: null,
  user: null,
  userName: null,
  email: null,
  userType: null,
  loading: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_USER_DATA":
      return {
        ...state,
        firebaseUser: action.payload.firebaseUser,
        user: action.payload.user,
        userName: action.payload.user.userName || null,
        email: action.payload.user.email || null,
        userType: action.payload.user.userType,
        loading: false,
      };
    case "CLEAR_USER":
      return { ...initialState, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function AuthProvider({
  children: childrenProp,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const isMountedRef = useRef(true);
  const { showAlert } = useModal();

  // Fonction pour charger les données utilisateur
  const loadUserData = useCallback(
    async (fbUser: FirebaseUser) => {
      try {
        const appType =
          process.env.EXPO_PUBLIC_APP_TYPE === "professional"
            ? "professional"
            : "patient";

        // Step 1: Fetch user doc (retry once after short delay for signup race condition)
        let userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (!isMountedRef.current) return;

        if (!userDoc.exists()) {
          // Doc may not exist yet if onAuthStateChanged fired before
          // login.tsx finished writing it — wait briefly and retry
          await new Promise((r) => setTimeout(r, 1500));
          if (!isMountedRef.current) return;
          userDoc = await getDoc(doc(db, "users", fbUser.uid));
          if (!isMountedRef.current) return;
        }

        let userData: User;

        if (!userDoc.exists()) {
          // Still no doc after retry — create it as fallback
          if (appType === "patient" && fbUser.email) {
            const fallbackName =
              fbUser.displayName || fbUser.email.split("@")[0];
            const createdUser = await createPatientUser(
              fbUser.uid,
              fbUser.email,
              fallbackName
            );
            if (!isMountedRef.current) return;

            dispatch({
              type: "SET_USER_DATA",
              payload: { firebaseUser: fbUser, user: createdUser },
            });
            return;
          }

          console.error("Utilisateur non trouvé dans Firestore");
          await firebaseSignOut(auth);
          return;
        }

        userData = {
          uid: fbUser.uid,
          ...userDoc.data(),
        } as User;

        // Step 2: Check access only after we know the doc exists
        const accessCheck = await canUserAccessApp(fbUser.uid, appType);
        if (!isMountedRef.current) return;

        if (!accessCheck.canAccess) {
          showAlert(
            "Accès non autorisé",
            accessCheck.reason ||
              "Vous ne pouvez pas accéder à cette application avec ce compte.",
            [
              {
                text: "OK",
                onPress: async () => {
                  await firebaseSignOut(auth);
                },
              },
            ],
          );

          dispatch({ type: "SET_LOADING", payload: false });
          return;
        }

        // Mettre à jour le dernier login (fire-and-forget, non bloquant)
        const appVersion = Constants.expoConfig?.version ?? "1.0.0";
        updateLastLogin(
          fbUser.uid,
          Platform.OS as "ios" | "android" | "web",
          appVersion,
        ).catch(console.error);

        // Enregistrer le push token pour les notifications (fire-and-forget)
        registerPushToken(fbUser.uid).catch(console.error);

        // Tout est OK, charger l'utilisateur (single dispatch au lieu de 5 setState)
        dispatch({
          type: "SET_USER_DATA",
          payload: { firebaseUser: fbUser, user: userData },
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error(
          "[AuthContext] loadUserData CATCH — error:",
          error,
        );
        showAlert(
          "Erreur",
          "Impossible de charger vos données. Veuillez réessayer.",
          [{ text: "OK", onPress: async () => await firebaseSignOut(auth) }],
        );
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    [showAlert],
  );

  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMountedRef.current) return;
      if (fbUser) {
        await loadUserData(fbUser);
        // Relancer l'auto-sync offline après login (stopAutoSync est appelé au signOut)
        startAutoSync();
      } else {
        dispatch({ type: "CLEAR_USER" });
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [loadUserData]);

  const signOut = useCallback(async () => {
    try {
      clearTodayEventsCache();
      await onOfflineQueueSignOut();
      await cancelAllReminders();
      // Supprimer les push tokens avant signOut (nécessite auth active)
      const uid = auth.currentUser?.uid;
      if (uid) await removePushTokens(uid).catch(() => {});
      await firebaseSignOut(auth);
      if (isMountedRef.current) {
        dispatch({ type: "CLEAR_USER" });
      }
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (state.firebaseUser) {
      await loadUserData(state.firebaseUser);
    }
  }, [state.firebaseUser, loadUserData]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser: state.firebaseUser,
        user: state.user,
        userName: state.userName,
        email: state.email,
        userType: state.userType,
        loading: state.loading,
        signOut,
        refreshUser,
      }}
    >
      {childrenProp}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
