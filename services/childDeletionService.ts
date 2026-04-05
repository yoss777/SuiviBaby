// services/childDeletionService.ts
// Wrapper client pour les Cloud Functions de suppression/transfert d'enfant.

import { functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";

// ============================================
// TYPES
// ============================================

export interface DeletionRequestResult {
  status: "approved" | "pending";
  requestId: string;
  ownerCount?: number;
}

export interface VoteResult {
  status: "approved" | "pending" | "refused";
}

export interface TransferResult {
  success: boolean;
}

export interface CancelResult {
  success: boolean;
}

// ============================================
// CLOUD FUNCTION CALLS
// ============================================

const createDeletionRequestCF = httpsCallable<
  { childId: string },
  DeletionRequestResult
>(functions, "createDeletionRequest");

const voteDeletionRequestCF = httpsCallable<
  { requestId: string; vote: "approved" | "refused" },
  VoteResult
>(functions, "voteDeletionRequest");

const transferAndLeaveCF = httpsCallable<
  { childId: string; newOwnerId: string },
  TransferResult
>(functions, "transferAndLeave");

const cancelChildDeletionCF = httpsCallable<
  { requestId: string },
  CancelResult
>(functions, "cancelChildDeletion");

// ============================================
// PUBLIC API
// ============================================

/**
 * Demande la suppression d'un enfant.
 * - Owner unique : approved + soft-delete immédiat
 * - Multi-owners : pending, en attente des votes
 */
export async function requestChildDeletion(
  childId: string,
): Promise<DeletionRequestResult> {
  const result = await createDeletionRequestCF({ childId });
  return result.data;
}

/**
 * Vote sur une demande de suppression en cours.
 */
export async function voteOnDeletionRequest(
  requestId: string,
  vote: "approved" | "refused",
): Promise<VoteResult> {
  const result = await voteDeletionRequestCF({ requestId, vote });
  return result.data;
}

/**
 * Transfère la propriété d'un enfant et quitte.
 */
export async function transferChildAndLeave(
  childId: string,
  newOwnerId: string,
): Promise<TransferResult> {
  const result = await transferAndLeaveCF({ childId, newOwnerId });
  return result.data;
}

/**
 * Annule une suppression soft-delete pendant la période de rétention.
 * Restaure l'accès pour le demandeur.
 */
export async function cancelChildDeletion(
  requestId: string,
): Promise<CancelResult> {
  const result = await cancelChildDeletionCF({ requestId });
  return result.data;
}
