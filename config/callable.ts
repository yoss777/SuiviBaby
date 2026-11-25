// Appels de Cloud Functions qui attendent App Check (ADR 0002).
//
// Les fonctions appelables imposent App Check : un appel parti avant le premier
// jeton (démarrage, « provider-not-ready ») serait refusé. Ce module remplace
// `httpsCallable` de firebase/functions avec la même signature : chaque appel
// attend d'abord, au plus 8 secondes, qu'App Check soit prêt, puis part quand
// même (le serveur tranche ; les écritures refusées passent par la file hors ligne).
import {
  httpsCallable as firebaseHttpsCallable,
  type Functions,
  type HttpsCallable,
  type HttpsCallableOptions,
  type HttpsCallableStreamOptions,
} from "firebase/functions";
import { waitForAppCheckReady } from "./appCheck";

export function httpsCallable<RequestData = unknown, ResponseData = unknown, StreamData = unknown>(
  functionsInstance: Functions,
  name: string,
  options?: HttpsCallableOptions,
): HttpsCallable<RequestData, ResponseData, StreamData> {
  const callable =
    options === undefined
      ? firebaseHttpsCallable<RequestData, ResponseData, StreamData>(functionsInstance, name)
      : firebaseHttpsCallable<RequestData, ResponseData, StreamData>(functionsInstance, name, options);
  const ready = () =>
    // Sans app Firebase (tests avec un Functions simulé) : rien à attendre.
    functionsInstance?.app ? waitForAppCheckReady(functionsInstance.app) : Promise.resolve(false);
  const wrapped = Object.assign(
    async (data?: RequestData | null) => {
      await ready();
      return callable(data);
    },
    {
      stream: async (data?: RequestData | null, streamOptions?: HttpsCallableStreamOptions) => {
        await ready();
        return callable.stream(data, streamOptions);
      },
    },
  ) satisfies HttpsCallable<RequestData, ResponseData, StreamData>;
  return wrapped;
}
