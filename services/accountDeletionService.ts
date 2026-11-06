import { auth, db } from "@/config/firebase";
import type { User } from "@/types/user";
import {
  EmailAuthProvider,
  getIdToken,
  reauthenticateWithCredential,
  type AuthCredential,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/config/firebase";
import {
  getQueueSize,
  onAccountDelete as purgeOfflineQueue,
  processQueue,
} from "@/services/offlineQueueService";
import {
  getAppleCredential,
  getGoogleCredential,
} from "@/services/socialAuthService";

const QUEUE_SYNC_TIMEOUT_MS = 5000;

/** True when the offline queue is empty (after a sync attempt bounded by a timeout). */
async function flushOfflineQueue(): Promise<boolean> {
  const attempt = async () => {
    if ((await getQueueSize()) === 0) return true;
    await processQueue();
    return (await getQueueSize()) === 0;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      attempt(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), QUEUE_SYNC_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type PendingDeletionInfo = NonNullable<User["pendingDeletion"]>;

/**
 * Message à montrer quand la demande est enregistrée mais que l'e-mail de
 * confirmation n'est pas parti (Resend en erreur). Null sinon.
 */
export function deletionEmailNotice(info: {
  deletionDate: string;
  emailSent?: boolean;
}): { title: string; message: string } | null {
  if (info.emailSent !== false) return null;
  const date = new Date(info.deletionDate);
  const when = Number.isNaN(date.getTime())
    ? "dans 30 jours"
    : `le ${date.toLocaleDateString("fr-FR")}`;
  return {
    title: "Suppression programmée",
    message: `Votre compte sera supprimé ${when}. Nous n'avons pas pu envoyer l'e-mail de confirmation : notez cette date, vous pouvez annuler la suppression depuis l'application jusque-là.`,
  };
}

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
  const details = (error as { details?: { reason?: unknown } } | null)?.details;
  if (details?.reason === "recent-login-required") {
    return "Pour votre sécurité, confirmez votre identité à nouveau : votre dernière connexion est trop ancienne. Réessayez et validez la demande de confirmation.";
  }
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
    case "deletion/child-delete-failed":
      return "La suppression du suivi d'un enfant a échoué. Votre compte n'a pas été supprimé. Réessayez.";
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

/** Choice value meaning "delete this child's tracking" (default in the modal). */
export const DELETE_CHILD_CHOICE = "__delete__";

/** Roles that get full owner rights when picked as the new owner: needs explicit confirmation. */
export const LOW_PRIVILEGE_ROLES = ["contributor", "viewer"];

export interface OwnershipTransfer {
  childId: string;
  newOwnerId: string;
}

/** Result of createDeletionRequest (pending when other owners must vote). */
export interface ChildDeletionOutcome {
  childId: string;
  status: string;
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
 * Ré-authentification selon le fournisseur (mot de passe, Google, Apple) puis
 * rafraîchissement du jeton (auth_time), révocation Apple, transfert de
 * propriété / suppression des enfants partagés, puis appel serveur
 * `requestAccountDeletion` (date, `pendingDeletion`, jetons push et e-mail
 * gérés côté serveur). L'utilisateur peut annuler via `cancelAccountDeletion()`.
 */
export async function requestAccountDeletion(
  options: {
    password?: string;
    transfers?: OwnershipTransfer[];
    /** Children whose tracking is deleted (30-day grace) instead of transferred. */
    childDeletions?: string[];
  } = {},
): Promise<PendingDeletionInfo & { emailSent?: boolean }> {
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
  // Force a token carrying the fresh auth_time checked by the server.
  await getIdToken(user, true);

  // Apple token revocation must be registered BEFORE scheduling (the server
  // needs the code at deletion time). Best effort: never block the deletion.
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

  // Children the owner chose to delete (30-day grace, other members lose access).
  const childDeletionCallable = httpsCallable<
    { childId: string },
    { status: string; requestId?: string }
  >(functions, "createDeletionRequest");
  for (const childId of options.childDeletions ?? []) {
    try {
      await childDeletionCallable({ childId });
    } catch (error) {
      console.warn("[DELETION] createDeletionRequest échoué:", error);
      throw new DeletionError("deletion/child-delete-failed");
    }
  }

  // Schedule the deletion server-side (date, pendingDeletion, push tokens, e-mail).
  const scheduledAt = new Date().toISOString();
  const result = await httpsCallable<
    Record<string, never>,
    { deletionDate: string; emailSent?: boolean }
  >(
    functions,
    "requestAccountDeletion",
  )({});
  const pendingDeletion: PendingDeletionInfo & { emailSent?: boolean } = {
    scheduledAt,
    deletionDate: result.data.deletionDate,
    // false : la demande est bien enregistrée mais l'e-mail n'est pas parti.
    emailSent: result.data.emailSent,
  };

  // Local copy of this account's unsent events. Deletion can still be cancelled
  // during the grace period, so first try to sync them (short timeout); purge
  // only when the queue is empty afterwards. Otherwise keep it: it is per user
  // and stays on the device. Best effort, never blocks.
  try {
    if (await flushOfflineQueue()) {
      await purgeOfflineQueue(user.uid);
    }
  } catch (error) {
    console.warn("[DELETION] file hors-ligne non traitée:", error);
  }

  return pendingDeletion;
}

/**
 * Annule une demande de suppression de compte en cours (via le serveur).
 */
export async function cancelAccountDeletion() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non authentifié.");
  }

  await httpsCallable<Record<string, never>, { success: boolean }>(
    functions,
    "cancelAccountDeletion",
  )({});
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

