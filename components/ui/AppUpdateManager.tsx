// components/ui/AppUpdateManager.tsx
// Manages app update banner + changelog modal
// Controlled by the "updates" notification preference toggle

import { CHANGELOG } from "@/data/changelog";
import { useAuth } from "@/contexts/AuthContext";
import {
  checkForUpdate,
  getCurrentVersion,
} from "@/services/appUpdateService";
import {
  getUserContentState,
  markChangelogSeen,
} from "@/services/smartContentService";
import { obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { captureServiceError } from "@/utils/errorReporting";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChangelogModal } from "./ChangelogModal";
import { UpdateBanner } from "./UpdateBanner";
import { useColorScheme } from "@/hooks/use-color-scheme";

const UPDATE_DISMISS_KEY = "samaye_update_dismissed";
// Min interval between two foreground rechecks — avoids hammering Firestore
// when the app is brought to foreground multiple times in a short window.
const RECHECK_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h

export function AppUpdateManager() {
  const colorScheme = useColorScheme() ?? "light";
  const { firebaseUser } = useAuth();
  const isMountedRef = useRef(true);

  // Update banner state
  const [showBanner, setShowBanner] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);

  // Changelog modal state
  const [showChangelog, setShowChangelog] = useState(false);
  const [updatesEnabled, setUpdatesEnabled] = useState(true);

  // Throttle + reentrancy guards for runVersionCheck (used by both initial
  // useEffect and AppState foreground listener).
  const lastVersionCheckRef = useRef<number>(0);
  const isVersionCheckingRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Version check (banner) — extracted so it can be triggered both on auth
  // change AND on AppState foreground (with throttle). Does NOT touch the
  // changelog flow to avoid extra Firestore reads on every foreground.
  const runVersionCheck = useCallback(async () => {
    if (isVersionCheckingRef.current) return;
    isVersionCheckingRef.current = true;
    try {
      const prefs = await obtenirPreferencesNotifications();
      if (!isMountedRef.current) return;
      setUpdatesEnabled(prefs.updates);
      if (!prefs.updates) return;

      const updateInfo = await checkForUpdate();
      if (!isMountedRef.current) return;

      if (updateInfo?.updateAvailable) {
        const dismissed = await AsyncStorage.getItem(UPDATE_DISMISS_KEY);
        if (!isMountedRef.current) return;
        if (
          dismissed === updateInfo.latestVersion &&
          !updateInfo.forceUpdate
        ) {
          // Already dismissed for this version, skip.
          return;
        }
        setLatestVersion(updateInfo.latestVersion);
        setStoreUrl(updateInfo.storeUrl);
        setForceUpdate(updateInfo.forceUpdate);
        setShowBanner(true);
      }
    } catch (e) {
      captureServiceError(e, {
        service: "appUpdate",
        operation: "managerVersionCheck",
      });
    } finally {
      lastVersionCheckRef.current = Date.now();
      isVersionCheckingRef.current = false;
    }
  }, []);

  // Changelog check — only relevant after a fresh install/update, so it runs
  // once on auth change and is NOT re-triggered on foreground.
  const runChangelogCheck = useCallback(async () => {
    try {
      const currentVersion = getCurrentVersion();
      const userContent = await getUserContentState();
      if (!isMountedRef.current) return;

      const currentChangelog = CHANGELOG.find(
        (entry) =>
          entry.version === currentVersion &&
          !userContent.seenChangelog.includes(entry.version),
      );

      if (currentChangelog) {
        setShowChangelog(true);
      }
    } catch (e) {
      captureServiceError(e, {
        service: "appUpdate",
        operation: "managerChangelogCheck",
      });
    }
  }, []);

  // Initial check on auth change — runs both flows.
  useEffect(() => {
    if (!firebaseUser) return;
    runVersionCheck();
    runChangelogCheck();
  }, [firebaseUser, runVersionCheck, runChangelogCheck]);

  // Foreground recheck — when the app comes back to active state, re-check
  // for a new version (not changelog) if enough time has passed since the
  // last check. Catches the case of long-lived sessions where the user never
  // logs out and would otherwise miss new releases.
  useEffect(() => {
    if (!firebaseUser) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState !== "active") return;
      const elapsed = Date.now() - lastVersionCheckRef.current;
      if (elapsed < RECHECK_THROTTLE_MS) return;
      runVersionCheck();
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [firebaseUser, runVersionCheck]);

  const handleDismissBanner = useCallback(async () => {
    setShowBanner(false);
    // Remember dismissal for this version
    try {
      await AsyncStorage.setItem(UPDATE_DISMISS_KEY, latestVersion);
    } catch {
      // Silent
    }
  }, [latestVersion]);

  const handleCloseChangelog = useCallback(async () => {
    setShowChangelog(false);
    // Mark current version as seen
    const currentVersion = getCurrentVersion();
    try {
      await markChangelogSeen(currentVersion);
    } catch {
      // Silent
    }
  }, []);

  if (!firebaseUser || !updatesEnabled) return null;

  return (
    <>
      <UpdateBanner
        visible={showBanner}
        latestVersion={latestVersion}
        storeUrl={storeUrl}
        forceUpdate={forceUpdate}
        onDismiss={handleDismissBanner}
      />
      <ChangelogModal
        visible={showChangelog}
        entries={CHANGELOG.filter(
          (e) => e.version === getCurrentVersion(),
        )}
        onClose={handleCloseChangelog}
        colorScheme={colorScheme}
      />
    </>
  );
}
