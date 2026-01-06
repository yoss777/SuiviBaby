import { useEffect } from "react";
import { useBaby } from "@/shared/contexts/BabyContext";
import { listenToApprovedRequests } from "@/shared/services/babyAttachmentService";

/**
 * Hook pour écouter les demandes de rattachement approuvées
 * et ajouter automatiquement les bébés à la liste
 */
export function useBabyAttachment(parentEmail: string | null) {
  const { addBaby, babies } = useBaby();

  useEffect(() => {
    if (!parentEmail) return;

    // Écouter les demandes approuvées
    const unsubscribe = listenToApprovedRequests(parentEmail, (requests) => {
      requests.forEach((request) => {
        if (request.babyData) {
          // Vérifier si le bébé n'est pas déjà dans la liste
          const babyExists = babies.some(
            (baby) => baby.id === request.simId
          );

          if (!babyExists) {
            // Ajouter le bébé à la liste
            addBaby({
              id: request.simId,
              name: request.babyData.name,
              birthDate: request.babyData.birthDate,
              gender: request.babyData.gender,
              photoUri: request.babyData.photoUri,
            });

            console.log(`Bébé ${request.babyData.name} ajouté avec succès`);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [parentEmail]);
}
