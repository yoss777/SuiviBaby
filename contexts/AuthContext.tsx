// contexts/AuthContext.tsx
import { auth, db } from "@/config/firebase";
import { useModal } from "@/contexts/ModalContext";
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
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (!isMountedRef.current) return;

        if (!userDoc.exists()) {
          const appType =
            process.env.EXPO_PUBLIC_APP_TYPE === "professional"
              ? "professional"
              : "patient";

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

        const userData = {
          uid: fbUser.uid,
          ...userDoc.data(),
        } as User;

        // Vérifier si l'utilisateur peut accéder à l'app actuelle
        const appType =
          process.env.EXPO_PUBLIC_APP_TYPE === "professional"
            ? "professional"
            : "patient";
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

        // Mettre à jour le dernier login
        const appVersion = Constants.expoConfig?.version ?? "1.0.0";
        await updateLastLogin(
          fbUser.uid,
          Platform.OS as "ios" | "android" | "web",
          appVersion,
        );
        if (!isMountedRef.current) return;

        // Tout est OK, charger l'utilisateur (single dispatch au lieu de 5 setState)
        dispatch({
          type: "SET_USER_DATA",
          payload: { firebaseUser: fbUser, user: userData },
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error(
          "Erreur lors de la récupération des données utilisateur:",
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
