// config/firebaseEnv.ts
// Pure environment resolution (no Firebase SDK import, safe to use anywhere).
//
// APP_ENV is read by app.config.js at build time ("production" by default,
// "staging" for the EAS staging profile) and exposed to the app through
// `expo.extra.appEnv` / `expo.extra.firebase`. The production web config stays
// the source of truth in config/firebaseEnvironments.json; the staging values
// there are placeholders until the `samaye-staging` project exists (S12, Q8).
import Constants from "expo-constants";
import type { FirebaseOptions } from "firebase/app";

import environments from "./firebaseEnvironments.json";

export type AppEnv = "production" | "staging";

export const APP_ENVS: readonly AppEnv[] = ["production", "staging"];

/** Marker used by the staging placeholders in firebaseEnvironments.json. */
export const STAGING_PLACEHOLDER_PREFIX = "STAGING_PLACEHOLDER_";

export const FIREBASE_WEB_CONFIGS: Record<AppEnv, FirebaseOptions> = environments;

type FirebaseExtra = {
  appEnv?: string;
  firebase?: Partial<FirebaseOptions>;
};

export function resolveAppEnv(value: unknown): AppEnv {
  return value === "staging" ? "staging" : "production";
}

/** Names of the config fields still holding a staging placeholder. */
export function findPlaceholderFields(config: FirebaseOptions): string[] {
  return Object.entries(config)
    .filter(
      ([, v]) => typeof v === "string" && v.startsWith(STAGING_PLACEHOLDER_PREFIX),
    )
    .map(([k]) => k);
}

/**
 * Builds the web config for `appEnv`: the committed values, overridden by the
 * ones app.config.js injected into `extra.firebase` (EXPO_PUBLIC_FIREBASE_*).
 * Throws when a field is still a placeholder, so a staging build made before
 * the staging project exists fails at launch instead of writing nowhere.
 */
export function buildFirebaseWebConfig(
  appEnv: AppEnv,
  overrides: Partial<FirebaseOptions> = {},
): FirebaseOptions {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => typeof v === "string" && v !== ""),
  );
  const config: FirebaseOptions = { ...FIREBASE_WEB_CONFIGS[appEnv], ...definedOverrides };
  const placeholders = findPlaceholderFields(config);
  if (placeholders.length > 0) {
    throw new Error(
      `Firebase config for APP_ENV=${appEnv} still has placeholder values (${placeholders.join(", ")}). ` +
        "Fill config/firebaseEnvironments.json or set the EXPO_PUBLIC_FIREBASE_* variables.",
    );
  }
  return config;
}

function getExtra(): FirebaseExtra {
  return (Constants.expoConfig?.extra ?? {}) as FirebaseExtra;
}

/** Environment baked into this build (production when nothing says otherwise). */
export function getAppEnv(): AppEnv {
  return resolveAppEnv(getExtra().appEnv);
}

/** Firebase web config of this build. */
export function getFirebaseWebConfig(): FirebaseOptions {
  const extra = getExtra();
  return buildFirebaseWebConfig(resolveAppEnv(extra.appEnv), extra.firebase ?? {});
}

/** Default bucket of a project (`<projectId>.firebasestorage.app`). */
export function defaultStorageBucket(projectId: string): string {
  return `${projectId}.firebasestorage.app`;
}
