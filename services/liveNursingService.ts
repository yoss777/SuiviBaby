// services/liveNursingService.ts
// Tétée en cours partagée par le foyer : document children/{childId}/live/nursing.
// C'est une donnée en cours, comme un sommeil ou une promenade : tous les
// aidants de l'enfant la lisent (et le widget l'affichera). Seuls ceux qui
// peuvent écrire des événements la modifient (règles Firestore). Aucun auteur
// n'est affiché : seule la mère allaite ; updatedBy sert uniquement aux règles
// et au diagnostic.
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import {
  isValidNursingState,
  type NursingTimerRemote,
  type NursingTimerState,
  setNursingTimerRemote,
  toNursingState,
} from "@/components/forms/nursingTimer";
import { auth, db } from "@/config/firebase";
import { captureServiceError } from "@/utils/errorReporting";
import { isConnectivityError } from "@/utils/networkError";

/** Hors ligne : attendu (le brouillon local fait foi). Le reste (règles, droits) se voit. */
function reportUnexpected(error: unknown, operation: string): void {
  if (!isConnectivityError(error)) captureServiceError(error, { service: "liveNursing", operation });
}

export const LIVE_NURSING_DOC_ID = "nursing";
export const LIVE_NURSING_VERSION = 1;

const liveNursingRef = (childId: string) =>
  doc(db, "children", childId, "live", LIVE_NURSING_DOC_ID);

/** Données du document, ou null si absent ou mal formé. */
export function parseLiveNursing(data: unknown): NursingTimerState | null {
  return isValidNursingState(data) ? toNursingState(data) : null;
}

export const liveNursingRemote: NursingTimerRemote = {
  async read(childId) {
    const snap = await getDoc(liveNursingRef(childId));
    return snap.exists() ? parseLiveNursing(snap.data()) : null;
  },

  async write(childId, state) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(liveNursingRef(childId), {
      ...toNursingState(state),
      v: LIVE_NURSING_VERSION,
      // Pas d'auteur (seule la mère allaite) : les règles vérifient l'accès.
      serverUpdatedAt: serverTimestamp(),
      });
    } catch (error) {
      reportUnexpected(error, "write");
      throw error;
    }
  },

  subscribe(childId, onChange) {
    return onSnapshot(
      liveNursingRef(childId),
      (snap) => onChange(snap.exists() ? parseLiveNursing(snap.data()) : null),
      (error) => {
        // Hors ligne : on garde l'état connu. Accès retiré ou règle : signalé,
        // et plus de tétée affichée (l'état connu n'est plus fiable).
        reportUnexpected(error, "subscribe");
        if (!isConnectivityError(error)) onChange(null);
      },
    );
  },
};

/** Branche le document partagé sur le chrono de tétée (appelé au démarrage de l'app). */
export function registerLiveNursingSync(): void {
  setNursingTimerRemote(liveNursingRemote);
}
