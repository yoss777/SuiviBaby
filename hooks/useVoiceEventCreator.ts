// hooks/useVoiceEventCreator.ts
// Firebase event creation/modification/deletion from parsed voice commands.

import VoiceCommandService from "@/services/voiceCommandService";
import type { ParsedCommandResult } from "@/services/voiceCommandService";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  obtenirEvenements,
  supprimerEvenement,
  supprimerJalon,
  Event,
  EventType,
} from "@/services/eventsService";
import { commandTypeToEventType } from "@/services/voiceCommandService";
import type { EventIdentifier } from "@/services/voiceCommandService";

// ---------------------------------------------------------------------------
// Modal feedback callback type
// ---------------------------------------------------------------------------

export interface ModalFeedback {
  showInfo: (title: string, message: string) => void;
}

// ---------------------------------------------------------------------------
// findEventByIdentifier — locate an existing event for modify/delete
// ---------------------------------------------------------------------------

export async function findEventByIdentifier(
  identifier: EventIdentifier,
  childIdToSearch: string,
): Promise<Event | null> {
  try {
    const eventType = commandTypeToEventType(identifier.type) as EventType;

    // Si "le dernier", on récupère le plus récent
    if (identifier.isLast) {
      const events = await obtenirEvenements(childIdToSearch, {
        type: eventType,
        limite: 1,
      });
      return events.length > 0 ? events[0] : null;
    }

    // Si une heure cible est spécifiée (ex: "de 15h20")
    if (identifier.targetTime) {
      const targetDate = identifier.targetTime;
      // Rechercher les événements de la journée
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const events = await obtenirEvenements(childIdToSearch, {
        type: eventType,
        depuis: startOfDay,
        jusqu: endOfDay,
      });

      // Trouver l'événement le plus proche de l'heure cible (tolérance de 30 min)
      const targetMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();
      let closestEvent: Event | null = null;
      let minDiff = Infinity;

      for (const event of events) {
        const eventDate = event.date instanceof Date
          ? event.date
          : (event.date as any).toDate?.() || new Date((event.date as any).seconds * 1000);
        const eventMinutes = eventDate.getHours() * 60 + eventDate.getMinutes();
        const diff = Math.abs(eventMinutes - targetMinutes);

        if (diff < minDiff && diff <= 30) { // Tolérance de 30 minutes
          minDiff = diff;
          closestEvent = event;
        }
      }
      return closestEvent;
    }

    // Si un temps relatif est spécifié (ex: "il y a 30 min")
    if (identifier.relativeTime) {
      const now = new Date();
      const targetTime = new Date(now.getTime() - identifier.relativeTime * 60 * 1000);

      // Fenêtre de recherche : target +/- 15 min
      const depuis = new Date(targetTime.getTime() - 15 * 60 * 1000);
      const jusqu = new Date(targetTime.getTime() + 15 * 60 * 1000);

      const events = await obtenirEvenements(childIdToSearch, {
        type: eventType,
        depuis,
        jusqu,
      });

      // Retourner le plus proche
      if (events.length > 0) {
        return events[0]; // Déjà trié par date desc
      }
      return null;
    }

    return null;
  } catch (error) {
    console.error("Erreur recherche événement:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// executeDelete
// ---------------------------------------------------------------------------

export async function executeDelete(
  type: string,
  childId: string,
  eventId: string,
  feedback: ModalFeedback,
) {
  try {
    const deleteFn = type === "jalon" ? supprimerJalon : supprimerEvenement;
    if (deleteFn) {
      await deleteFn(childId, eventId);
      feedback.showInfo(
        "Succès",
        `${type.charAt(0).toUpperCase() + type.slice(1)} supprimé avec succès`,
      );
    } else {
      feedback.showInfo(
        "Erreur",
        `La suppression du type "${type}" n'est pas encore implémentée`,
      );
    }
  } catch (error) {
    console.error("❌ Erreur suppression:", error);
    feedback.showInfo(
      "Erreur",
      `Impossible de supprimer:\n${error instanceof Error ? error.message : "Erreur inconnue"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// executeModify
// ---------------------------------------------------------------------------

export async function executeModify(
  type: string,
  childId: string,
  eventId: string,
  modifications: Partial<ParsedCommandResult>,
  previousEvent: Event | null,
  feedback: ModalFeedback,
) {
  try {
    if (!previousEvent) {
      feedback.showInfo("Erreur", "Impossible de modifier sans l'événement courant");
      return;
    }

    // Convertir les modifications au format Firebase
    const dataToUpdate: Record<string, any> = {};

    if (modifications.quantite !== undefined) {
      dataToUpdate.quantite = modifications.quantite;
    }
    if (modifications.quantiteGauche !== undefined) {
      dataToUpdate.quantiteGauche = modifications.quantiteGauche;
    }
    if (modifications.quantiteDroite !== undefined) {
      dataToUpdate.quantiteDroite = modifications.quantiteDroite;
    }
    if (modifications.consistance !== undefined) {
      dataToUpdate.consistance = modifications.consistance;
    }
    if (modifications.couleur !== undefined) {
      dataToUpdate.couleur = modifications.couleur;
    }
    if (modifications.typeBiberon !== undefined) {
      dataToUpdate.typeBiberon = modifications.typeBiberon;
    }
    if (modifications.duree !== undefined) {
      dataToUpdate.duree = modifications.duree;
    }
    if (modifications.valeurTemperature !== undefined) {
      dataToUpdate.valeur = modifications.valeurTemperature;
    }
    if (modifications.dosage !== undefined) {
      dataToUpdate.dosage = modifications.dosage;
    }

    dataToUpdate.updatedAt = new Date();
    dataToUpdate.note = `Modifié par commande vocale`;

    if (previousEvent.type === type) {
      modifierEvenementOptimistic(
        childId,
        eventId,
        dataToUpdate,
        previousEvent,
      );
      feedback.showInfo(
        "Succès",
        `${type.charAt(0).toUpperCase() + type.slice(1)} modifié avec succès`,
      );
    } else {
      feedback.showInfo(
        "Erreur",
        `La modification du type "${type}" n'est pas encore implémentée`,
      );
    }
  } catch (error) {
    console.error("❌ Erreur modification:", error);
    feedback.showInfo(
      "Erreur",
      `Impossible de modifier:\n${error instanceof Error ? error.message : "Erreur inconnue"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// executeCommand — main dispatcher (add / modify / delete)
// ---------------------------------------------------------------------------

export async function executeCommand(
  command: ParsedCommandResult,
  childId: string,
  feedback: ModalFeedback,
  avecCouche?: boolean,
  excretionSelection?: { pipi: boolean; popo: boolean },
  targetEvent?: Event | null,
) {
  try {
    const action = command.action || "add";

    // ==== SUPPRESSION ====
    if (action === "delete") {
      if (!targetEvent?.id) {
        feedback.showInfo("Erreur", "Aucun événement trouvé à supprimer");
        return;
      }

      await executeDelete(command.type, childId, targetEvent.id, feedback);
      return;
    }

    // ==== MODIFICATION ====
    if (action === "modify") {
      if (!targetEvent?.id) {
        feedback.showInfo("Erreur", "Aucun événement trouvé à modifier");
        return;
      }

      const modifications = command.modifications || {};
      await executeModify(
        command.type,
        childId,
        targetEvent.id,
        modifications,
        targetEvent,
        feedback,
      );
      return;
    }

    // ==== AJOUT (action === "add") ====
    const data = VoiceCommandService.formatDataForFirebase(command);
    console.log("💾 Ajout dans Firebase:", { type: command.type, data });

    switch (command.type) {
      case "tetee":
        const splitDuration =
          command.coteGauche && command.coteDroit
            ? command.quantite
              ? command.quantite / 2
              : undefined
            : command.quantite;
        const dataTetee = {
          ...data,
          type: "tetee" as const,
          dureeGauche: command.coteGauche ? splitDuration : undefined,
          dureeDroite: command.coteDroit ? splitDuration : undefined,
        };
        ajouterEvenementOptimistic(childId, dataTetee);
        feedback.showInfo("Succès", "Tétée ajoutée avec succès");
        break;

      case "biberon":
        const dataBiberon = {
          ...data,
          type: "biberon" as const,
        };
        ajouterEvenementOptimistic(childId, dataBiberon);
        feedback.showInfo("Succès", "Biberon ajouté avec succès");
        break;

      case "pompage":
        const dataPompage = {
          ...data,
          type: "pompage" as const,
        };
        ajouterEvenementOptimistic(childId, dataPompage);
        feedback.showInfo("Succès", "Pompage ajouté avec succès");
        break;

      case "couche":
        const { type: _unusedType, ...dataCoucheBase } = data as {
          type?: string;
        };
        const dataCouche = {
          ...dataCoucheBase,
          avecCouche: true,
        };

        const promesses = [];
        const shouldAddPipi = excretionSelection?.pipi ?? false;
        const shouldAddPopo = excretionSelection?.popo ?? false;

        if (shouldAddPipi) {
          ajouterEvenementOptimistic(childId, {
            ...dataCouche,
            type: "miction" as const,
          });
          promesses.push(Promise.resolve());
        }

        if (shouldAddPopo) {
          ajouterEvenementOptimistic(childId, {
            ...dataCouche,
            type: "selle" as const,
          });
          promesses.push(Promise.resolve());
        }

        if (promesses.length > 0) {
          await Promise.all(promesses);
          feedback.showInfo("Succès", "Excrétion ajoutée avec succès");
        } else {
          feedback.showInfo("Info", "Aucune excrétion à ajouter.");
        }
        break;

      case "miction":
        const { type: _unusedMictionType, ...dataMictionBase } = data as {
          type?: string;
        };
        const dataMiction = {
          ...dataMictionBase,
          type: "miction" as const,
          avecCouche: !!avecCouche,
        };
        ajouterEvenementOptimistic(childId, dataMiction);
        feedback.showInfo("Succès", "Miction ajoutée avec succès");
        break;

      case "selle":
        const { type: _unusedSelleType, ...dataSelleBase } = data as {
          type?: string;
        };
        const dataSelle = {
          ...dataSelleBase,
          type: "selle" as const,
          avecCouche: !!avecCouche,
        };
        ajouterEvenementOptimistic(childId, dataSelle);
        feedback.showInfo("Succès", "Selle ajoutée avec succès");
        break;

      case "vitamine":
        const dataVitamine = {
          ...data,
          type: "vitamine" as const,
          nomVitamine: command.nomVitamine || "Vitamine D",
        };
        ajouterEvenementOptimistic(childId, dataVitamine);
        feedback.showInfo("Succès", "Vitamine ajoutée avec succès");
        break;

      case "sommeil":
        // Si pas de durée -> sommeil "en cours" : vérifier qu'il n'y en a pas déjà un
        if (!(data as any).duree) {
          const recentSleeps = await obtenirEvenements(childId, {
            type: "sommeil" as EventType,
            limite: 5,
          });
          const hasOngoing = recentSleeps.some(
            (e: any) => e.heureDebut && !e.heureFin,
          );
          if (hasOngoing) {
            feedback.showInfo(
              "Sommeil déjà en cours",
              "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau.",
            );
            break;
          }
        }
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "sommeil" as const,
        });
        feedback.showInfo("Succès", "Sommeil ajouté avec succès");
        break;

      case "activite":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "activite" as const,
        });
        feedback.showInfo("Succès", "Activité ajoutée avec succès");
        break;

      case "jalon":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "jalon" as const,
        });
        feedback.showInfo("Succès", "Jalon ajouté avec succès");
        break;

      case "croissance":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "croissance" as const,
        });
        feedback.showInfo("Succès", "Croissance ajoutée avec succès");
        break;

      case "solide":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "solide" as const,
        });
        feedback.showInfo("Succès", "Repas solide ajouté avec succès");
        break;

      case "bain":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "bain" as const,
        });
        feedback.showInfo("Succès", "Bain ajouté avec succès");
        break;

      case "temperature":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "temperature" as const,
        });
        feedback.showInfo("Succès", "Température ajoutée avec succès");
        break;

      case "medicament":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "medicament" as const,
        });
        feedback.showInfo("Succès", "Médicament ajouté avec succès");
        break;

      case "symptome":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "symptome" as const,
        });
        feedback.showInfo("Succès", "Symptôme ajouté avec succès");
        break;

      case "vaccin":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "vaccin" as const,
        });
        feedback.showInfo("Succès", "Vaccin ajouté avec succès");
        break;

      default:
        feedback.showInfo("Info", `Le type "${command.type}" n'est pas encore implémenté`);
    }
  } catch (error) {
    console.error("❌ Erreur exécution commande:", error);
    feedback.showInfo(
      "Erreur",
      `Impossible d'ajouter l'élément:\n${
        error instanceof Error ? error.message : "Erreur inconnue"
      }`,
    );
  }
}
