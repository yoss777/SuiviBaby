// hooks/useEventEditHandler.ts
//
// Edit-button dispatch for every event type rendered on the home tab.
// Given an event, route it either to the matching bottom-sheet form
// (preferred — keeps the user on the home tab) or to a tab page with
// an `editId` query param as a fallback for deep-link / legacy callers.
//
// Extracted verbatim from home.tsx (S3-T1c). Pure dispatch: no closure
// on the home component's state, every dependency is passed as an
// argument, so the hook can live in /hooks alongside the other custom
// hooks the home component composes.

import { router } from "expo-router";
import React, { useCallback } from "react";

// Open-sheet payload is a discriminated union (see SheetContext) and the
// hook builds the per-event-type variant inline. Use the loose `any`
// signature originally accepted by openSheet so we don't have to import
// every form-sheet props variant here just to type the dispatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenSheetFn = (args: any) => void;
type ToDateFn = (value: unknown) => Date;

export function getEditRoute(event: { id?: string; type?: string }): string | null {
  if (!event.id) return null;
  const id = encodeURIComponent(event.id);
  switch (event.type) {
    case "tetee":
      return `/baby/meals?tab=seins&editId=${id}&returnTo=home`;
    case "biberon":
      return `/baby/meals?tab=biberons&editId=${id}&returnTo=home`;
    case "pompage":
      return `/baby/pumping?editId=${id}&returnTo=home`;
    case "sommeil":
      return `/baby/routines?editId=${id}&returnTo=home`;
    case "bain":
    case "nettoyage_nez":
      return `/baby/routines?editId=${id}&returnTo=home`;
    case "temperature":
    case "medicament":
    case "symptome":
    case "vaccin":
    case "vitamine":
      return `/baby/soins?editId=${id}&returnTo=home`;
    case "miction":
      return `/baby/diapers?tab=mictions&editId=${id}&returnTo=home`;
    case "selle":
      return `/baby/diapers?tab=selles&editId=${id}&returnTo=home`;
    case "activite":
      return `/baby/activities?editId=${id}&returnTo=home`;
    case "jalon":
      return `/baby/milestones?editId=${id}&returnTo=home`;
    default:
      return null;
  }
}

export function useEventEditHandler(
  openSheet: OpenSheetFn,
  toDate: ToDateFn,
  headerOwnerId: React.MutableRefObject<string>,
  sommeilEnCours: any,
  promenadeEnCours: any,
  showToast?: (msg: string) => void,
) {
  return useCallback(
    (event: any) => {
      if (event.id?.startsWith?.("__optimistic_")) {
        showToast?.("Enregistrement en cours...");
        return;
      }
      if (!event.id) {
        const route = getEditRoute(event);
        if (route) router.push(route as any);
        return;
      }

      const handlers: Record<string, () => void> = {
        temperature: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "temperature",
            editData: {
              id: event.id,
              type: "temperature",
              date: toDate(event.date),
              valeur: event.valeur,
              modePrise: event.modePrise,
              note: event.note,
            },
          }),
        medicament: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "medicament",
            editData: {
              id: event.id,
              type: "medicament",
              date: toDate(event.date),
              nomMedicament: event.nomMedicament,
              dosage: event.dosage,
              voie: event.voie,
              note: event.note,
            },
          }),
        symptome: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "symptome",
            editData: {
              id: event.id,
              type: "symptome",
              date: toDate(event.date),
              symptomes: event.symptomes,
              intensite: event.intensite,
              note: event.note,
            },
          }),
        vaccin: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "vaccin",
            editData: {
              id: event.id,
              type: "vaccin",
              date: toDate(event.date),
              nomVaccin: event.nomVaccin || event.lib || "",
              dosage: event.dosage || "",
              note: event.note,
            },
          }),
        vitamine: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "vitamine",
            editData: {
              id: event.id,
              type: "vitamine",
              date: toDate(event.date),
              nomVitamine: event.nomVitamine || "Vitamine D",
              dosage: event.dosage,
              note: event.note,
            },
          }),
        tetee: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType: "tetee",
            editData: {
              id: event.id,
              type: "tetee",
              date: toDate(event.date),
              dureeGauche: event.dureeGauche,
              dureeDroite: event.dureeDroite,
            },
          }),
        biberon: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType: "biberon",
            editData: {
              id: event.id,
              type: "biberon",
              date: toDate(event.date),
              quantite: event.quantite,
              typeBiberon: event.typeBiberon,
            },
          }),
        solide: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType: "solide",
            editData: {
              id: event.id,
              type: "solide",
              date: toDate(event.date),
              typeSolide: event.typeSolide,
              momentRepas: event.momentRepas,
              ingredients: event.ingredients,
              quantiteSolide: event.quantite,
              nouveauAliment: event.nouveauAliment,
              nomNouvelAliment: event.nomNouvelAliment,
              allergenes: event.allergenes,
              reaction: event.reaction,
              aime: event.aime,
            },
          }),
        pompage: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "pumping",
            editData: {
              id: event.id,
              date: toDate(event.date),
              quantiteGauche: event.quantiteGauche,
              quantiteDroite: event.quantiteDroite,
              duree: event.duree,
              note: event.note,
            },
          }),
        activite: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "activities",
            activiteType: event.typeActivite ?? "tummyTime",
            editData: {
              id: event.id,
              typeActivite: event.typeActivite ?? "tummyTime",
              duree: event.duree,
              description: event.description ?? event.note,
              date: toDate(event.date),
              heureDebut: event.heureDebut ? toDate(event.heureDebut) : undefined,
              heureFin: event.heureFin ? toDate(event.heureFin) : undefined,
            },
            promenadeEnCours: promenadeEnCours ?? null,
          }),
        jalon: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "milestones",
            jalonType: event.typeJalon ?? "photo",
            editData: {
              id: event.id,
              typeJalon: event.typeJalon ?? "photo",
              titre: event.titre,
              description: event.description,
              note: event.note,
              humeur: event.humeur,
              photos: event.photos,
              date: toDate(event.date),
            },
          }),
        miction: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "diapers",
            diapersType: "miction",
            editData: {
              id: event.id,
              type: "miction",
              date: toDate(event.date),
              couleur: event.couleur,
            },
          }),
        selle: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "diapers",
            diapersType: "selle",
            editData: {
              id: event.id,
              type: "selle",
              date: toDate(event.date),
              consistance: event.consistance,
              quantite: event.quantite,
            },
          }),
        sommeil: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "sommeil",
            sleepMode: event.isNap ? "nap" : "night",
            editData: {
              id: event.id,
              type: "sommeil",
              date: toDate(event.heureDebut),
              heureDebut: toDate(event.heureDebut),
              heureFin: event.heureFin ? toDate(event.heureFin) : undefined,
              isNap: event.isNap,
              location: event.location,
              quality: event.quality,
              note: event.note,
            },
            sommeilEnCours,
          }),
        bain: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "bain",
            editData: {
              id: event.id,
              type: "bain",
              date: toDate(event.date),
              duree: event.duree,
              temperatureEau: event.temperature,
              note: event.note,
            },
          }),
        nettoyage_nez: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "nettoyage_nez",
            editData: {
              id: event.id,
              type: "nettoyage_nez",
              date: toDate(event.date),
              methode: event.methode,
              resultat: event.resultat,
              note: event.note,
            },
          }),
        croissance: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "croissance",
            editData: {
              id: event.id,
              date: toDate(event.date),
              tailleCm: event.tailleCm,
              poidsKg: event.poidsKg,
              teteCm: event.teteCm,
            },
          }),
      };

      const handler = handlers[event.type];
      if (handler) {
        handler();
      } else {
        const route = getEditRoute(event);
        if (route) router.push(route as any);
      }
    },
    [openSheet, toDate, headerOwnerId, sommeilEnCours, promenadeEnCours, showToast],
  );
}
