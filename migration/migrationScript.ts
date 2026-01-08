// Script de migration des anciennes collections vers la collection unifiée "events"

import React from "react";
import {
    Timestamp,
    collection,
    doc,
    getDocs,
    query,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { Event, EventType } from "../services/eventsService";

interface MigrationResult {
  success: number;
  errors: number;
  skipped: number;
  details: {
    collection: string;
    success: number;
    errors: number;
  }[];
}

/**
 * Mapping des anciennes collections vers les nouveaux types
 */
const COLLECTIONS_TO_MIGRATE = [
  { oldName: "tetees", newType: "tetee" as EventType },
  { oldName: "biberons", newType: "biberon" as EventType },
  { oldName: "pompages", newType: "pompage" as EventType },
  { oldName: "couches", newType: "couche_mixte" as EventType }, // Sera ajusté selon pipi/popo
  { oldName: "sommeil", newType: "sommeil" as EventType },
  { oldName: "vaccins", newType: "vaccin" as EventType },
  { oldName: "vitamines", newType: "vitamine" as EventType },
  { oldName: "mictions", newType: "miction" as EventType },
  { oldName: "selles", newType: "selle" as EventType },
];

/**
 * Supprime les champs undefined d'un objet (Firestore n'accepte pas undefined)
 */
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

/**
 * Transforme les données de l'ancien format vers le nouveau
 */
function transformData(oldData: any, newType: EventType): Partial<Event> {
  const base = {
    type: newType,
    date: oldData.date || oldData.createdAt,
    createdAt: oldData.createdAt,
    note: oldData.note,
    migratedAt: Timestamp.now(),
  };

  switch (newType) {
    case "tetee":
      // Vérifier si c'est un biberon (ancien format avait type: "biberons")
      if (oldData.type === "biberons" || oldData.quantite) {
        return {
          ...base,
          type: "biberon",
          quantite: oldData.quantite || 0,
        };
      }

      // Sinon c'est une tétée au sein
      return {
        ...base,
        type: "tetee",
        coteGauche: oldData.coteGauche || false,
        coteDroit: oldData.coteDroit || false,
        dureeGauche: oldData.dureeGauche,
        dureeDroite: oldData.dureeDroite,
      };

    case "biberon":
      return {
        ...base,
        type: "biberon",
        quantite: oldData.quantite || 0,
      };

    case "pompage":
      return {
        ...base,
        type: "pompage",
        quantiteGauche: oldData.quantiteGauche,
        quantiteDroite: oldData.quantiteDroite,
        duree: oldData.duree,
      };

    case "couche_mixte":
    case "couche":
      // Pour les couches, on crée juste un simple event "couche"
      // Les détails pipi/popo sont gérés dans mictions et selles
      return {
        ...base,
        type: "couche",
      };

    case "sommeil":
      return {
        ...base,
        type: "sommeil",
        duree: oldData.duree || oldData.quantite,
        heureDebut: oldData.heureDebut,
        heureFin: oldData.heureFin,
      };

    case "vaccin":
      return {
        ...base,
        type: "vaccin",
        nomVaccin: oldData.nomVaccin || oldData.lib || oldData.nom || "Vaccin",
        lieu: oldData.lieu,
      };

    case "vitamine":
      return {
        ...base,
        type: "vitamine",
        nomVitamine: oldData.nomVitamine || oldData.lib || oldData.nom || "Vitamine D",
        dosage: oldData.dosage,
      };

    case "miction":
      return {
        ...base,
        type: "miction",
        volume: oldData.volume,
      };

    case "selle":
      return {
        ...base,
        type: "selle",
        consistance: oldData.consistance,
        couleur: oldData.couleur,
      };

    default:
      return base;
  }
}

/**
 * Migre une collection spécifique
 */
async function migrateCollection(
  userId: string,
  childId: string,
  oldCollectionName: string,
  newType: EventType
): Promise<{ success: number; errors: number }> {
  try {
    // Récupère tous les documents de l'ancienne collection
    const q = query(
      collection(db, oldCollectionName),
      where("userId", "==", userId),
      where("childId", "==", childId)
    );

    const snapshot = await getDocs(q);
    console.log(`📦 ${snapshot.size} documents trouvés dans ${oldCollectionName}`);

    if (snapshot.empty) {
      return { success: 0, errors: 0 };
    }

    // Migration par batch de 500 (limite Firestore)
    const BATCH_SIZE = 500;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const batchDocs = snapshot.docs.slice(i, i + BATCH_SIZE);

      for (const oldDoc of batchDocs) {
        try {
          const oldData = oldDoc.data();
          const newData = transformData(oldData, newType);

          // Nettoyer les undefined avant d'écrire dans Firestore
          const cleanData = removeUndefined({
            ...newData,
            childId,
            userId,
          });

          // Crée le document dans la nouvelle collection
          const newDocRef = doc(collection(db, "events"));
          batch.set(newDocRef, cleanData);

          successCount++;
        } catch (error) {
          console.error(`❌ Erreur pour doc ${oldDoc.id}:`, error);
          errorCount++;
        }
      }

      await batch.commit();
      console.log(`✅ Batch ${i / BATCH_SIZE + 1} migré (${batchDocs.length} docs)`);
    }

    return { success: successCount, errors: errorCount };
  } catch (error) {
    console.error(`❌ Erreur migration ${oldCollectionName}:`, error);
    throw error;
  }
}

/**
 * Lance la migration complète pour un enfant
 */
export async function migrerToutesLesCollections(
  userId: string,
  childId: string,
  options?: {
    dryRun?: boolean; // Si true, ne fait que compter sans migrer
    collectionsToMigrate?: string[]; // Permet de migrer seulement certaines collections
  }
): Promise<MigrationResult> {
  console.log("🚀 Début de la migration");
  console.log(`   User: ${userId}`);
  console.log(`   Child: ${childId}`);
  console.log(`   Dry Run: ${options?.dryRun || false}`);

  const result: MigrationResult = {
    success: 0,
    errors: 0,
    skipped: 0,
    details: [],
  };

  // Filtre les collections si spécifié
  const collectionsToProcess = COLLECTIONS_TO_MIGRATE.filter(
    (col) =>
      !options?.collectionsToMigrate ||
      options.collectionsToMigrate.includes(col.oldName)
  );

  for (const { oldName, newType } of collectionsToProcess) {
    try {
      console.log(`\n📂 Migration de ${oldName}...`);

      if (options?.dryRun) {
        // Mode dry run : compte seulement
        const q = query(
          collection(db, oldName),
          where("userId", "==", userId),
          where("childId", "==", childId)
        );
        const snapshot = await getDocs(q);
        console.log(`   ${snapshot.size} documents à migrer`);
        result.details.push({
          collection: oldName,
          success: snapshot.size,
          errors: 0,
        });
      } else {
        // Migration réelle
        const { success, errors } = await migrateCollection(
          userId,
          childId,
          oldName,
          newType
        );
        result.success += success;
        result.errors += errors;
        result.details.push({
          collection: oldName,
          success,
          errors,
        });
      }
    } catch (error) {
      console.error(`❌ Erreur pour ${oldName}:`, error);
      result.errors++;
    }
  }

  console.log("\n✅ Migration terminée");
  console.log(`   Succès: ${result.success}`);
  console.log(`   Erreurs: ${result.errors}`);
  
  return result;
}

/**
 * Vérifie si la migration a déjà été effectuée
 */
export async function verifierMigration(
  userId: string,
  childId: string
): Promise<{
  migrated: boolean;
  eventCount: number;
  oldCollectionsCount: {
    [collection: string]: number;
  };
}> {
  // Compte les events dans la nouvelle collection
  const eventsQuery = query(
    collection(db, "events"),
    where("userId", "==", userId),
    where("childId", "==", childId),
    where("migratedAt", "!=", null)
  );
  const eventsSnapshot = await getDocs(eventsQuery);

  // Compte dans chaque ancienne collection
  const oldCollectionsCount: { [key: string]: number } = {};
  
  for (const { oldName } of COLLECTIONS_TO_MIGRATE) {
    const q = query(
      collection(db, oldName),
      where("userId", "==", userId),
      where("childId", "==", childId)
    );
    const snapshot = await getDocs(q);
    oldCollectionsCount[oldName] = snapshot.size;
  }

  const totalOldCount = Object.values(oldCollectionsCount).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    migrated: eventsSnapshot.size > 0 && eventsSnapshot.size >= totalOldCount,
    eventCount: eventsSnapshot.size,
    oldCollectionsCount,
  };
}

/**
 * Hook React pour utiliser la migration
 */
export function useMigration() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [result, setResult] = React.useState<MigrationResult | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  const migrate = async (
    userId: string,
    childId: string,
    options?: Parameters<typeof migrerToutesLesCollections>[2]
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await migrerToutesLesCollections(userId, childId, options);
      setResult(res);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  return { migrate, isLoading, result, error };
}

// Exemple d'utilisation dans un composant
/*
import { useMigration } from './migrationScript';

function MigrationButton() {
  const { migrate, isLoading, result } = useMigration();
  const userId = auth.currentUser?.uid;
  const childId = "...";

  return (
    <View>
      <Button
        onPress={() => migrate(userId, childId)}
        disabled={isLoading}
      >
        {isLoading ? "Migration..." : "Migrer les données"}
      </Button>
      
      {result && (
        <Text>
          ✅ {result.success} événements migrés
          {result.errors > 0 && `\n❌ ${result.errors} erreurs`}
        </Text>
      )}
    </View>
  );
}
*/