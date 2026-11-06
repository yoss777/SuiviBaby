import { auth, db } from "@/config/firebase";
import type { User } from "@/types/user";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  type AuthCredential,
} from "firebase/auth";
import { doc, getDoc, deleteField, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/config/firebase";
import {
  getAppleCredential,
  getGoogleCredential,
} from "@/services/socialAuthService";

const GRACE_PERIOD_DAYS = 30;

export type PendingDeletionInfo = NonNullable<User["pendingDeletion"]>;

export function getPendingDeletionInfo(
  user: Pick<User, "pendingDeletion"> | null | undefined,
): PendingDeletionInfo | null {
  return user?.pendingDeletion ?? null;
}

export function hasPendingDeletion(
  user: Pick<User, "pendingDeletion"> | null | undefined,
): boolean {
  return !!getPendingDeletionInfo(user)?.deletionDate;
}

export function getPendingDeletionDateFromUser(
  user: Pick<User, "pendingDeletion"> | null | undefined,
): string | null {
  return getPendingDeletionInfo(user)?.deletionDate ?? null;
}

export function formatPendingDeletionDate(
  deletionDate: string | null | undefined,
  locale = "fr-FR",
): string {
  if (!deletionDate) return "";
  const parsedDate = new Date(deletionDate);
  if (Number.isNaN(parsedDate.getTime())) return deletionDate;

  return parsedDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type DeletionAuthMethod = "password" | "google" | "apple";

/** Provider used to re-authenticate before deletion (password wins if linked). */
export function getDeletionAuthMethod(
  user: { providerData?: ({ providerId: string } | null)[] } | null | undefined,
): DeletionAuthMethod | null {
  const ids = (user?.providerData ?? []).map((p) => p?.providerId);
  if (ids.includes("password")) return "password";
  if (ids.includes("google.com")) return "google";
  if (ids.includes("apple.com")) return "apple";
  return null;
}

/** Error with a stable `code`, mapped to a French message by mapDeletionError. */
export class DeletionError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "DeletionError";
    this.code = code;
  }
}

const CANCEL_CODES = new Set([
  "deletion/cancelled",
  "ERR_REQUEST_CANCELED",
  "ERR_CANCELED",
  "SIGN_IN_CANCELLED",
  "12501",
]);

export function mapDeletionError(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  if (CANCEL_CODES.has(code)) {
    return "Confirmation annulée. Votre compte n'a pas été modifié.";
  }
  switch (code) {
    case "auth/user-mismatch":
      return "Vous avez choisi un autre compte que celui avec lequel vous êtes connecté. Sélectionnez le même compte Google ou Apple.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Mot de passe incorrect.";
    case "auth/requires-recent-login":
      return "Veuillez vous reconnecter puis réessayer.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/network-request-failed":
    case "functions/unavailable":
    case "functions/deadline-exceeded":
      return "Problème de connexion. Vérifiez votre réseau puis réessayez.";
    case "deletion/transfer-failed":
      return "Le transfert de propriété a échoué. Votre compte n'a pas été supprimé. Réessayez.";
    default:
      return "Impossible de programmer la suppression du compte.";
  }
}

export interface OwnershipBlockerMember {
  uid: string;
  role: string;
  displayName?: string;
}

export interface OwnershipBlocker {
  childId: string;
  childName: string;
  members: OwnershipBlockerMember[];
}

export interface OwnershipTransfer {
  childId: string;
  newOwnerId: string;
}

/**
 * Children for which the user is the only owner/admin while other members
 * exist. Throws on failure: deletion must not proceed blindly.
 */
export async function getOwnershipBlockers(): Promise<OwnershipBlocker[]> {
  const callable = httpsCallable<void, { children?: OwnershipBlocker[] }>(
    functions,
    "getOwnershipBlockers",
  );
  const result = await callable();
  const children = result.data?.children;
  return Array.isArray(children) ? children : [];
}

async function reauthenticate(
  method: DeletionAuthMethod,
  password: string | undefined,
): Promise<{ appleAuthorizationCode: string | null }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non authentifié.");

  let credential: AuthCredential | null;
  let appleAuthorizationCode: string | null = null;

  try {
    if (method === "password") {
      if (!password || !user.email) {
        throw new DeletionError("auth/wrong-password");
      }
      credential = EmailAuthProvider.credential(user.email, password);
    } else if (method === "google") {
      credential = await getGoogleCredential();
    } else {
      const apple = await getAppleCredential();
      credential = apple.credential;
      appleAuthorizationCode = apple.authorizationCode;
    }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code && CANCEL_CODES.has(code)) {
      throw new DeletionError("deletion/cancelled");
    }
    throw error;
  }

  if (!credential) throw new DeletionError("deletion/cancelled");

  // Firebase requires a recent login before sensitive operations
  await reauthenticateWithCredential(user, credential);
  return { appleAuthorizationCode };
}

/**
 * Demande la suppression du compte avec délai de grâce de 30 jours.
 * Ré-authentification selon le fournisseur (mot de passe, Google, Apple), puis
 * transfert de propriété éventuel, puis marquage `pendingDeletion` — la
 * suppression effective est déléguée à une Cloud Function schedulée.
 * L'utilisateur peut annuler pendant le délai via `cancelAccountDeletion()`.
 */
export async function requestAccountDeletion(
  options: { password?: string; transfers?: OwnershipTransfer[] } = {},
): Promise<PendingDeletionInfo> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non authentifié.");
  }

  const method = getDeletionAuthMethod(user);
  if (!method) {
    throw new Error("Mode de connexion non pris en charge.");
  }

  const { appleAuthorizationCode } = await reauthenticate(
    method,
    options.password,
  );

  // Hand over shared children first: stop here if any transfer fails.
  const transferCallable = httpsCallable<
    OwnershipTransfer,
    { success: boolean }
  >(functions, "transferAndLeave");
  for (const { childId, newOwnerId } of options.transfers ?? []) {
    try {
      await transferCallable({ childId, newOwnerId });
    } catch (error) {
      console.warn("[DELETION] transferAndLeave échoué:", error);
      throw new DeletionError("deletion/transfer-failed");
    }
  }

  // Marquer le compte pour suppression différée
  const scheduledAt = new Date();
  const deletionDate = new Date(scheduledAt);
  deletionDate.setDate(deletionDate.getDate() + GRACE_PERIOD_DAYS);
  const pendingDeletion: PendingDeletionInfo = {
    scheduledAt: scheduledAt.toISOString(),
    deletionDate: deletionDate.toISOString(),
  };

  await updateDoc(doc(db, "users", user.uid), {
    pendingDeletion,
  });

  // Apple token revocation is best effort: never block the deletion.
  if (method === "apple" && appleAuthorizationCode) {
    try {
      await httpsCallable<{ authorizationCode: string }, { stored: boolean }>(
        functions,
        "registerAppleRevocation",
      )({ authorizationCode: appleAuthorizationCode });
    } catch (error) {
      console.warn("[DELETION] registerAppleRevocation échoué:", error);
    }
  }

  return pendingDeletion;
}

/**
 * Annule une demande de suppression de compte en cours.
 */
export async function cancelAccountDeletion() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non authentifié.");
  }

  await updateDoc(doc(db, "users", user.uid), {
    pendingDeletion: deleteField(),
  });
}

/**
 * Vérifie si le compte a une suppression programmée.
 * Retourne la date de suppression ou null.
 */
export async function getPendingDeletionDate(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const data = userDoc.data();
  return data?.pendingDeletion?.deletionDate ?? null;
}

