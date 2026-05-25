import { functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";

export type UsageFeature = "voice" | "export" | "sharing";

export interface UsageQuotaStatus {
  feature: UsageFeature;
  allowed: boolean;
  isUnlimited: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  resetDate: string | null;
}

const getUsageQuotaStatusCF = httpsCallable<
  { feature: UsageFeature; childId?: string },
  UsageQuotaStatus
>(functions, "getUsageQuotaStatus");

const consumeUsageQuotaCF = httpsCallable<
  { feature: Extract<UsageFeature, "voice" | "export">; childIds?: string[] },
  UsageQuotaStatus
>(functions, "consumeUsageQuota");

export const createShareInvitationCF = httpsCallable<
  { childId: string; childName?: string; invitedEmail: string },
  { id: string }
>(functions, "createShareInvitation");

export async function getUsageQuotaStatus(
  feature: UsageFeature,
  options?: { childId?: string },
): Promise<UsageQuotaStatus> {
  const result = await getUsageQuotaStatusCF({
    feature,
    childId: options?.childId,
  });
  return result.data;
}

export async function getVoiceUsageStatus(): Promise<UsageQuotaStatus> {
  return getUsageQuotaStatus("voice");
}

export async function getExportUsageStatus(): Promise<UsageQuotaStatus> {
  return getUsageQuotaStatus("export");
}

export async function getSharingUsageStatus(
  childId: string,
): Promise<UsageQuotaStatus> {
  return getUsageQuotaStatus("sharing", { childId });
}

export async function consumeVoiceQuota(): Promise<UsageQuotaStatus> {
  const result = await consumeUsageQuotaCF({ feature: "voice" });
  return result.data;
}

export async function consumeExportQuota(childIds: string[]): Promise<UsageQuotaStatus> {
  if (!Array.isArray(childIds) || childIds.length === 0) {
    throw new Error("childIds (array non vide) requis pour consommer le quota export.");
  }
  const result = await consumeUsageQuotaCF({ feature: "export", childIds });
  return result.data;
}
