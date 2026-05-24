// hooks/useVoiceEventCreator.ts
// Firebase event creation/modification/deletion from parsed voice commands.

import VoiceCommandService from "@/services/voiceCommandService";
import {
  commandTypeToEventType,
  type EventIdentifier,
  type ParsedCommandResult,
} from "@/services/voiceCommandService";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  obtenirEvenements,
  supprimerEvenement,
  supprimerJalon,
  Event,
  EventType,
} from "@/services/eventsService";

// ---------------------------------------------------------------------------
// Modal feedback callback type
// ---------------------------------------------------------------------------

export interface ModalFeedback {
  showInfo: (title: string, message: string) => void;
}

/**
 * Normalize an event's updatedAt into millis. Returns undefined when the
 * event has never been updated (e.g. just-created locally) — in that case
 * we skip the optimistic lock rather than reject a legitimate first edit.
 */
function extractUpdatedAtMillis(event: any): number | undefined {
  const raw = event?.updatedAt;
  if (!raw) return undefined;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw.toMillis === "function") return raw.toMillis();
  if (typeof raw.toDate === "function") return raw.toDate().getTime();
  if (typeof raw.seconds === "number") {
    return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1_000_000);
  }
  if (typeof raw === "number") return raw;
  return undefined;
}

// ---------------------------------------------------------------------------
// findEventByIdentifier — locate an existing event for modify/delete
// ---------------------------------------------------------------------------

// T2.5 — tolerance tightened from ±30 to ±10 min so the parser is less likely
// to "guess" the wrong event when two are close in time. If more than one
// event falls inside the window, we return AmbiguousMatch so the UI can
// prompt the user instead of silently picking one.
const TARGET_TIME_TOLERANCE_MIN = 10;
const LAST_EVENT_AMBIGUITY_WINDOW_MIN = 5;

export interface AmbiguousMatch {
  ambiguous: true;
  candidates: Event[];
}

export type FindEventResult = Event | AmbiguousMatch | null;

function isAmbiguous(result: FindEventResult): result is AmbiguousMatch {
  return !!result && (result as AmbiguousMatch).ambiguous === true;
}

function eventDateToDate(event: Event): Date {
  return event.date instanceof Date
    ? event.date
    : (event.date as any).toDate?.() ?? new Date((event.date as any).seconds * 1000);
}

export async function findEventByIdentifier(
  identifier: EventIdentifier,
  childIdToSearch: string,
): Promise<FindEventResult> {
  try {
    const eventType = commandTypeToEventType(identifier.type) as EventType;

    // "le dernier" — récupère le plus récent, mais avertit si plusieurs events
    // du même type existent dans une fenêtre serrée (= ambigu côté humain).
    if (identifier.isLast) {
      const events = await obtenirEvenements(childIdToSearch, {
        type: eventType,
        limite: 2,
      });
      if (events.length === 0) return null;
      if (events.length === 1) return events[0];

      const first = eventDateToDate(events[0]);
      const second = eventDateToDate(events[1]);
      const diffMin = Math.abs(first.getTime() - second.getTime()) / 60_000;
      if (diffMin <= LAST_EVENT_AMBIGUITY_WINDOW_MIN) {
        return { ambiguous: true, candidates: events };
      }
      return events[0];
    }

    // "de 15h20" — fenêtre ±10 min. Si plusieurs candidats, ambigu.
    if (identifier.targetTime) {
      const targetDate = identifier.targetTime;
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const events = await obtenirEvenements(childIdToSearch, {
        type: eventType,
        depuis: startOfDay,
        jusqu: endOfDay,
      });

      const targetMs = targetDate.getTime();
      const candidates: Event[] = [];
      for (const event of events) {
        const diffMin = Math.abs(eventDateToDate(event).getTime() - targetMs) / 60_000;
        if (diffMin <= TARGET_TIME_TOLERANCE_MIN) {
          candidates.push(event);
        }
      }

      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];
      return { ambiguous: true, candidates };
    }

    // "il y a 30 min" — fenêtre ±10 min (resserrée depuis ±15).
    if (identifier.relativeTime) {
      const now = new Date();
      const targetTime = new Date(now.getTime() - identifier.relativeTime * 60 * 1000);
      const depuis = new Date(targetTime.getTime() - TARGET_TIME_TOLERANCE_MIN * 60 * 1000);
      const jusqu = new Date(targetTime.getTime() + TARGET_TIME_TOLERANCE_MIN * 60 * 1000);

      const events = await obtenirEvenements(childIdToSearch, {
        type: eventType,
        depuis,
        jusqu,
      });

      if (events.length === 0) return null;
      if (events.length === 1) return events[0];
      return { ambiguous: true, candidates: events };
    }

    return null;
  } catch (error) {
    console.error("Erreur recherche événement:", error);
    return null;
  }
}

export { isAmbiguous };

// ---------------------------------------------------------------------------
// executeDelete
// ---------------------------------------------------------------------------

export async function executeDelete(
  type: string,
  childId: string,
  eventId: string,
  feedback: ModalFeedback,
): Promise<boolean> {
  try {
    const deleteFn = type === "jalon" ? supprimerJalon : supprimerEvenement;
    if (deleteFn) {
      await deleteFn(childId, eventId);
      feedback.showInfo(
        "Succès",
        `${type.charAt(0).toUpperCase() + type.slice(1)} supprimé avec succès`,
      );
      return true;
    } else {
      feedback.showInfo(
        "Erreur",
        `La suppression du type "${type}" n'est pas encore implémentée`,
      );
      return false;
    }
  } catch (error) {
    console.error("❌ Erreur suppression:", error);
    feedback.showInfo(
      "Erreur",
      `Impossible de supprimer:\n${error instanceof Error ? error.message : "Erreur inconnue"}`,
    );
    return false;
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
): Promise<boolean> {
  try {
    if (!previousEvent) {
      feedback.showInfo("Erreur", "Impossible de modifier sans l'événement courant");
      return false;
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
      // T2.2 — extract previous updatedAt as an optimistic lock token.
      // If a concurrent edit landed since we read the event, the CF will
      // reject with code "aborted" and the optimistic store rolls back the
      // visual change. The user sees the original value reappear (via the
      // existing failOptimistic path) — a clearer toast would require
      // plumbing failure metadata through optimisticEventsStore, which is
      // tracked separately.
      const expectedUpdatedAt = extractUpdatedAtMillis(previousEvent);

      modifierEvenementOptimistic(
        childId,
        eventId,
        dataToUpdate,
        previousEvent,
        expectedUpdatedAt,
      );
      feedback.showInfo(
        "Succès",
        `${type.charAt(0).toUpperCase() + type.slice(1)} modifié avec succès`,
      );
      return true;
    } else {
      feedback.showInfo(
        "Erreur",
        `La modification du type "${type}" n'est pas encore implémentée`,
      );
      return false;
    }
  } catch (error) {
    console.error("❌ Erreur modification:", error);
    feedback.showInfo(
      "Erreur",
      `Impossible de modifier:\n${error instanceof Error ? error.message : "Erreur inconnue"}`,
    );
    return false;
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
): Promise<boolean> {
  try {
    const action = command.action || "add";

    // ==== SUPPRESSION ====
    if (action === "delete") {
      if (!targetEvent?.id) {
        feedback.showInfo("Erreur", "Aucun événement trouvé à supprimer");
        return false;
      }

      return await executeDelete(command.type, childId, targetEvent.id, feedback);
    }

    // ==== MODIFICATION ====
    if (action === "modify") {
      if (!targetEvent?.id) {
        feedback.showInfo("Erreur", "Aucun événement trouvé à modifier");
        return false;
      }

      const modifications = command.modifications || {};
      return await executeModify(
        command.type,
        childId,
        targetEvent.id,
        modifications,
        targetEvent,
        feedback,
      );
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
        return true;

      case "biberon":
        const dataBiberon = {
          ...data,
          type: "biberon" as const,
        };
        ajouterEvenementOptimistic(childId, dataBiberon);
        feedback.showInfo("Succès", "Biberon ajouté avec succès");
        return true;

      case "pompage":
        const dataPompage = {
          ...data,
          type: "pompage" as const,
        };
        ajouterEvenementOptimistic(childId, dataPompage);
        feedback.showInfo("Succès", "Pompage ajouté avec succès");
        return true;

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
          return true;
        } else {
          feedback.showInfo("Info", "Aucune excrétion à ajouter.");
          return false;
        }

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
        return true;

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
        return true;

      case "vitamine":
        const dataVitamine = {
          ...data,
          type: "vitamine" as const,
          nomVitamine: command.nomVitamine || "Vitamine D",
        };
        ajouterEvenementOptimistic(childId, dataVitamine);
        feedback.showInfo("Succès", "Vitamine ajoutée avec succès");
        return true;

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
            return false;
          }
        }
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "sommeil" as const,
        });
        feedback.showInfo("Succès", "Sommeil ajouté avec succès");
        return true;

      case "activite":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "activite" as const,
        });
        feedback.showInfo("Succès", "Activité ajoutée avec succès");
        return true;

      case "jalon":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "jalon" as const,
        });
        feedback.showInfo("Succès", "Jalon ajouté avec succès");
        return true;

      case "croissance":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "croissance" as const,
        });
        feedback.showInfo("Succès", "Croissance ajoutée avec succès");
        return true;

      case "solide":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "solide" as const,
        });
        feedback.showInfo("Succès", "Repas solide ajouté avec succès");
        return true;

      case "bain":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "bain" as const,
        });
        feedback.showInfo("Succès", "Bain ajouté avec succès");
        return true;

      case "temperature":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "temperature" as const,
        });
        feedback.showInfo("Succès", "Température ajoutée avec succès");
        return true;

      case "medicament":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "medicament" as const,
        });
        feedback.showInfo("Succès", "Médicament ajouté avec succès");
        return true;

      case "symptome":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "symptome" as const,
        });
        feedback.showInfo("Succès", "Symptôme ajouté avec succès");
        return true;

      case "vaccin":
        ajouterEvenementOptimistic(childId, {
          ...data,
          type: "vaccin" as const,
        });
        feedback.showInfo("Succès", "Vaccin ajouté avec succès");
        return true;

      default:
        feedback.showInfo("Info", `Le type "${command.type}" n'est pas encore implémenté`);
        return false;
    }
  } catch (error) {
    console.error("❌ Erreur exécution commande:", error);
    feedback.showInfo(
      "Erreur",
      `Impossible d'ajouter l'élément:\n${
        error instanceof Error ? error.message : "Erreur inconnue"
      }`,
    );
    return false;
  }
}
