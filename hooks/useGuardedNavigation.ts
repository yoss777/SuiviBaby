import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";

/** Délai de repli après lequel une nouvelle navigation est de nouveau permise. */
export const NAVIGATION_LOCK_MS = 600;

// Verrou partagé par toute l'app : une seule navigation à la fois, quel que
// soit l'écran (les écrans empilés restent montés et ont chacun leur hook).
let locked = false;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

export function resetNavigationGuard() {
  locked = false;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;
}

function acquireLock() {
  locked = true;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(resetNavigationGuard, NAVIGATION_LOCK_MS);
}

type Params = Record<string, string>;
type Href = string | { pathname: string; params?: Record<string, unknown> };

/** Retire les groupes "(drawer)" etc. pour comparer avec usePathname(). */
function stripGroups(path: string): string {
  const cleaned = path.replace(/\/\([^/)]*\)/g, "");
  return cleaned === "" ? "/" : cleaned;
}

function parseHref(href: Href): { path: string; params: Params } {
  const params: Params = {};
  let rawPath: string;
  if (typeof href === "string") {
    const [p, query = ""] = href.split("?");
    rawPath = p;
    for (const pair of query.split("&")) {
      if (!pair) continue;
      const [k, v = ""] = pair.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  } else {
    rawPath = href.pathname;
    for (const [k, v] of Object.entries(href.params ?? {})) {
      if (v !== undefined && v !== null) params[k] = String(v);
    }
  }
  return { path: stripGroups(rawPath), params };
}

/**
 * Navigation protégée contre les doubles appuis : ignore une navigation tant
 * que la précédente est en cours (verrou ~600 ms, partagé par toute l'app) et
 * ne navigue pas vers une route déjà affichée (même chemin + mêmes params).
 * Les fonctions retournées sont stables.
 */
export function useGuardedNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();

  const routerRef = useRef(router);
  routerRef.current = router;
  const currentRef = useRef({ pathname, params: globalParams as Record<string, unknown> });
  currentRef.current = { pathname, params: globalParams as Record<string, unknown> };

  const run = useCallback((method: "push" | "replace" | "navigate", href: Href) => {
    if (locked) return;
    const target = parseHref(href);
    const current = currentRef.current;
    const sameRoute =
      stripGroups(current.pathname) === target.path &&
      Object.entries(target.params).every(([k, v]) => {
        const cur = current.params?.[k];
        return (Array.isArray(cur) ? cur[0] : cur) === v;
      });
    if (sameRoute) return;
    acquireLock();
    (routerRef.current[method] as (h: any) => void)(href);
  }, []);

  const push = useCallback((href: Href) => run("push", href), [run]);
  const replace = useCallback((href: Href) => run("replace", href), [run]);
  const navigate = useCallback((href: Href) => run("navigate", href), [run]);

  return useMemo(() => ({ push, replace, navigate }), [push, replace, navigate]);
}
