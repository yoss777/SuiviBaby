// contexts/AuthContext.tsx
import { auth, db } from "@/config/firebase";
import { useModal } from "@/contexts/ModalContext";
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
import { createContext, useContext, useEffect, useState } from "react";
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

export function AuthProvider({
  children: childrenProp,
}: {
  children: React.ReactNode;
}) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useModal();

  // Fonction pour charger les données utilisateur
  const loadUserData = async (fbUser: FirebaseUser) => {
    try {
      const userDoc = await getDoc(doc(db, "users", fbUser.uid));
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
          console.log("[AuthContext] User created in Firestore:", fbUser.uid);

          setUser(createdUser);
          setUserName(createdUser.userName || null);
          setEmail(createdUser.email || null);
          setUserType(createdUser.userType);
          setFirebaseUser(fbUser);
          setLoading(false);
          return;
        }

        console.error("Utilisateur non trouvé dans Firestore");
        await firebaseSignOut(auth);
        return;
      }

      const userData = {
        uid: fbUser.uid, // Ajouter l'UID depuis Firebase Auth
        ...userDoc.data(),
      } as User;

      console.log("[AuthContext] User data loaded, uid:", userData.uid);

      // Vérifier si l'utilisateur peut accéder à l'app actuelle
      const appType =
        process.env.EXPO_PUBLIC_APP_TYPE === "professional"
          ? "professional"
          : "patient";
      // const appType = process.env.EXPO_PUBLIC_APP_TYPE === 'blockedAccount' ? 'blockedAccount' : 'patient';
      const accessCheck = await canUserAccessApp(fbUser.uid, appType);

      if (!accessCheck.canAccess) {
        // L'utilisateur ne peut pas accéder à cette app
        console.log("Access denied:", accessCheck.reason);

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

        setLoading(false);
        return;
      }

      // Mettre à jour le dernier login
      const appVersion = Constants.expoConfig?.version ?? "1.0.0";
      await updateLastLogin(
        fbUser.uid,
        Platform.OS as "ios" | "android" | "web",
        appVersion,
      );

      // Tout est OK, charger l'utilisateur
      setUser(userData);
      setUserName(userData.userName || null);
      setEmail(userData.email || null);
      setUserType(userData.userType);
      setFirebaseUser(fbUser);
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des données utilisateur:",
        error,
      );
      showAlert(
        "Erreur",
        "Impossible de charger vos données. Veuillez réessayer.",
        [{ text: "OK", onPress: async () => await firebaseSignOut(auth) }],
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        await loadUserData(fbUser);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setUserName(null);
        setEmail(null);
        setUserType(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setFirebaseUser(null);
      setUser(null);
      setUserName(null);
      setEmail(null);
      setUserType(null);
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
      throw error;
    }
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      await loadUserData(firebaseUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        userName,
        email,
        userType,
        loading,
        signOut,
        refreshUser,
      }}
    >
      {childrenProp}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
