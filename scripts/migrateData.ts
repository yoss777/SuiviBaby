// scripts/migrateData.ts
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";

const USER_ID = "***USER_ID***"; // Remplacez par l'ID utilisateur approprié

const collections = [
  "tetees",
  "pompages",
  "mictions",
  "selles",
  "vitamines",
  "vaccins"
];

async function migrateCollection(collectionName: string) {
  console.log(`🔄 Migration de ${collectionName}...`);
  
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    let count = 0;
    
    for (const docSnapshot of querySnapshot.docs) {
      // Vérifier si le document n'a pas déjà un userId
      if (!docSnapshot.data().userId) {
        await updateDoc(doc(db, collectionName, docSnapshot.id), {
          userId: USER_ID
        });
        count++;
      }
    }
    
    console.log(`✅ ${collectionName}: ${count} documents mis à jour`);
  } catch (error) {
    console.error(`❌ Erreur pour ${collectionName}:`, error);
  }
}

async function migrateAllData() {
  console.log("🚀 Début de la migration...\n");
  
  for (const collectionName of collections) {
    await migrateCollection(collectionName);
  }
  
  console.log("\n✨ Migration terminée!");
}

// Exécuter la migration
migrateAllData();