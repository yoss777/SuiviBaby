/**
 * Script de vérification de la synchronisation des IDs
 * entre les anciennes collections (OLD) et la nouvelle collection events (NEW)
 */

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";

// Types pour les résultats
export interface SyncResult {
  both: string[];        // IDs présents dans OLD et NEW
  oldOnly: string[];     // IDs uniquement dans OLD (données avant migration)
  newOnly: string[];     // IDs uniquement dans NEW (⚠️ ne devrait pas arriver)
  totalOld: number;
  totalNew: number;
  syncRate: number;      // Taux de synchronisation en %
}

export interface FullSyncReport {
  tetees: SyncResult;
  biberons: SyncResult;
  mictions: SyncResult;
  selles: SyncResult;
  pompages: SyncResult;
  vaccins: SyncResult;
  vitamines: SyncResult;
  summary: {
    totalBoth: number;
    totalOldOnly: number;
    totalNewOnly: number;
    overallSyncRate: number;
    timestamp: string;
  };
}

/**
 * Vérifie la synchronisation des IDs pour un type d'événement
 */
async function verifySyncForType(
  childId: string,
  oldCollectionName: string,
  newEventType: string
): Promise<SyncResult> {
  try {
    console.log(`🔍 Vérification ${oldCollectionName}...`);

    // Récupérer tous les IDs de l'ancienne collection
    const oldQuery = query(
      collection(db, oldCollectionName),
      where("childId", "==", childId)
    );
    const oldSnapshot = await getDocs(oldQuery);
    const oldIds = new Set(oldSnapshot.docs.map((d) => d.id));

    // Récupérer tous les IDs de la nouvelle collection (events avec le type correspondant)
    const newQuery = query(
      collection(db, "events"),
      where("childId", "==", childId),
      where("type", "==", newEventType)
    );
    const newSnapshot = await getDocs(newQuery);
    const newIds = new Set(newSnapshot.docs.map((d) => d.id));

    // Calculer les différences
    const both: string[] = [];
    const oldOnly: string[] = [];

    for (const id of oldIds) {
      if (newIds.has(id)) {
        both.push(id);
      } else {
        oldOnly.push(id);
      }
    }

    const newOnly: string[] = [];
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        newOnly.push(id);
      }
    }

    const syncRate =
      oldIds.size > 0 ? (both.length / oldIds.size) * 100 : 100;

    console.log(
      `  ✅ ${oldCollectionName}: ${both.length} synchronisés, ${oldOnly.length} OLD seul, ${newOnly.length} NEW seul`
    );

    return {
      both,
      oldOnly,
      newOnly,
      totalOld: oldIds.size,
      totalNew: newIds.size,
      syncRate,
    };
  } catch (error) {
    console.error(`❌ Erreur vérification ${oldCollectionName}:`, error);
    throw error;
  }
}

/**
 * Vérifie la synchronisation pour tous les types d'événements
 */
export async function verifyFullSync(
  childId: string
): Promise<FullSyncReport> {
  console.log("🚀 Début de la vérification de synchronisation...");
  console.log(`👶 Enfant: ${childId}`);
  console.log("---");

  const [tetees, biberons, mictions, selles, pompages, vaccins, vitamines] =
    await Promise.all([
      verifySyncForType(childId, "tetees", "tetee"),
      verifySyncForType(childId, "biberons", "biberon"),
      verifySyncForType(childId, "mictions", "miction"),
      verifySyncForType(childId, "selles", "selle"),
      verifySyncForType(childId, "pompages", "pompage"),
      verifySyncForType(childId, "vaccins", "vaccin"),
      verifySyncForType(childId, "vitamines", "vitamine"),
    ]);

  // Note: biberons est une vue logique, les données sont dans tetees
  // On peut ignorer biberons dans le summary
  const summary = {
    totalBoth:
      tetees.both.length +
      mictions.both.length +
      selles.both.length +
      pompages.both.length +
      vaccins.both.length +
      vitamines.both.length,
    totalOldOnly:
      tetees.oldOnly.length +
      mictions.oldOnly.length +
      selles.oldOnly.length +
      pompages.oldOnly.length +
      vaccins.oldOnly.length +
      vitamines.oldOnly.length,
    totalNewOnly:
      tetees.newOnly.length +
      mictions.newOnly.length +
      selles.newOnly.length +
      pompages.newOnly.length +
      vaccins.newOnly.length +
      vitamines.newOnly.length,
    overallSyncRate: 0,
    timestamp: new Date().toISOString(),
  };

  const totalOld =
    tetees.totalOld +
    mictions.totalOld +
    selles.totalOld +
    pompages.totalOld +
    vaccins.totalOld +
    vitamines.totalOld;

  summary.overallSyncRate =
    totalOld > 0 ? (summary.totalBoth / totalOld) * 100 : 100;

  console.log("---");
  console.log("📊 RÉSUMÉ GLOBAL:");
  console.log(`  • Synchronisés (OLD + NEW): ${summary.totalBoth}`);
  console.log(`  • OLD uniquement (avant migration): ${summary.totalOldOnly}`);
  console.log(
    `  • NEW uniquement (⚠️ problème): ${summary.totalNewOnly}`
  );
  console.log(`  • Taux de synchronisation: ${summary.overallSyncRate.toFixed(2)}%`);

  if (summary.totalNewOnly > 0) {
    console.log(
      "\n⚠️ ATTENTION: Des événements existent dans NEW mais pas dans OLD!"
    );
    console.log(
      "Cela ne devrait pas arriver en phase DOUBLE_WRITE. Vérifiez les logs."
    );
  }

  return {
    tetees,
    biberons,
    mictions,
    selles,
    pompages,
    vaccins,
    vitamines,
    summary,
  };
}

/**
 * Compare les données d'un événement spécifique entre OLD et NEW
 */
export async function compareEventData(
  eventId: string,
  oldCollectionName: string,
  newEventType: string
) {
  console.log(`🔍 Comparaison de l'événement ${eventId}...`);

  try {
    // Récupérer depuis OLD
    const oldDocRef = collection(db, oldCollectionName);
    const oldQueryResult = query(oldDocRef, where("__name__", "==", eventId));
    const oldSnapshot = await getDocs(oldQueryResult);

    if (oldSnapshot.empty) {
      console.log(`❌ Document ${eventId} non trouvé dans ${oldCollectionName}`);
      return null;
    }

    const oldData = oldSnapshot.docs[0].data();

    // Récupérer depuis NEW
    const newDocRef = collection(db, "events");
    const newQueryResult = query(newDocRef, where("__name__", "==", eventId));
    const newSnapshot = await getDocs(newQueryResult);

    if (newSnapshot.empty) {
      console.log(`❌ Document ${eventId} non trouvé dans events`);
      return null;
    }

    const newData = newSnapshot.docs[0].data();

    // Comparer les champs importants
    const diffs: Array<{ field: string; old: any; new: any }> = [];

    // Comparer la date
    const oldDate = oldData.date instanceof Timestamp ? oldData.date : null;
    const newDate = newData.date instanceof Timestamp ? newData.date : null;

    if (oldDate && newDate) {
      if (Math.abs(oldDate.seconds - newDate.seconds) > 1) {
        diffs.push({
          field: "date",
          old: oldDate.toDate().toISOString(),
          new: newDate.toDate().toISOString(),
        });
      }
    }

    // Comparer les autres champs selon le type
    const fieldsToCompare = getFieldsForType(newEventType);

    for (const field of fieldsToCompare) {
      if (oldData[field] !== newData[field]) {
        diffs.push({
          field,
          old: oldData[field],
          new: newData[field],
        });
      }
    }

    if (diffs.length === 0) {
      console.log(`✅ Données identiques pour ${eventId}`);
    } else {
      console.log(`⚠️ Différences trouvées pour ${eventId}:`);
      diffs.forEach((diff) => {
        console.log(`  • ${diff.field}: OLD="${diff.old}" vs NEW="${diff.new}"`);
      });
    }

    return {
      identical: diffs.length === 0,
      differences: diffs,
      oldData,
      newData,
    };
  } catch (error) {
    console.error("❌ Erreur lors de la comparaison:", error);
    throw error;
  }
}

/**
 * Retourne les champs à comparer selon le type d'événement
 */
function getFieldsForType(type: string): string[] {
  const commonFields = ["note", "childId", "userId"];

  const typeFields: Record<string, string[]> = {
    tetee: ["coteGauche", "coteDroit", "dureeGauche", "dureeDroite"],
    biberon: ["quantite"],
    miction: [],
    selle: ["couleur", "consistance"],
    pompage: ["quantiteGauche", "quantiteDroite"],
    vaccin: ["nom", "dose"],
    vitamine: ["nom", "dose"],
  };

  return [...commonFields, ...(typeFields[type] || [])];
}

/**
 * Génère un rapport lisible
 */
export function generateReport(report: FullSyncReport): string {
  const lines = [
    "═══════════════════════════════════════════════════════",
    "📊 RAPPORT DE SYNCHRONISATION",
    "═══════════════════════════════════════════════════════",
    "",
    `🕐 Date: ${new Date(report.summary.timestamp).toLocaleString("fr-FR")}`,
    "",
    "───────────────────────────────────────────────────────",
    "DÉTAILS PAR TYPE",
    "───────────────────────────────────────────────────────",
  ];

  const types = [
    { name: "Tétées", data: report.tetees },
    { name: "Mictions", data: report.mictions },
    { name: "Selles", data: report.selles },
    { name: "Pompages", data: report.pompages },
    { name: "Vaccins", data: report.vaccins },
    { name: "Vitamines", data: report.vitamines },
  ];

  types.forEach(({ name, data }) => {
    lines.push("");
    lines.push(`📌 ${name}`);
    lines.push(`   Total OLD: ${data.totalOld}`);
    lines.push(`   Total NEW: ${data.totalNew}`);
    lines.push(`   ✅ Synchronisés: ${data.both.length}`);
    lines.push(`   📦 OLD uniquement: ${data.oldOnly.length}`);
    lines.push(`   ⚠️  NEW uniquement: ${data.newOnly.length}`);
    lines.push(`   📊 Taux de sync: ${data.syncRate.toFixed(2)}%`);
  });

  lines.push("");
  lines.push("───────────────────────────────────────────────────────");
  lines.push("RÉSUMÉ GLOBAL");
  lines.push("───────────────────────────────────────────────────────");
  lines.push("");
  lines.push(`✅ Événements synchronisés: ${report.summary.totalBoth}`);
  lines.push(`📦 Événements OLD uniquement: ${report.summary.totalOldOnly}`);
  lines.push(`⚠️  Événements NEW uniquement: ${report.summary.totalNewOnly}`);
  lines.push("");
  lines.push(
    `🎯 TAUX DE SYNCHRONISATION GLOBAL: ${report.summary.overallSyncRate.toFixed(2)}%`
  );
  lines.push("");

  if (report.summary.totalNewOnly > 0) {
    lines.push("⚠️  ALERTE: Des événements existent dans NEW mais pas dans OLD!");
    lines.push("   Cela indique un problème avec le double-write.");
    lines.push("");
  }

  if (report.summary.overallSyncRate < 95) {
    lines.push("⚠️  ATTENTION: Taux de synchronisation < 95%");
    lines.push("   Vérifiez les logs d'erreurs du double-write.");
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════");

  return lines.join("\n");
}
