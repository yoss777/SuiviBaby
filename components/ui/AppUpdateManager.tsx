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
import React, { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChangelogModal } from "./ChangelogModal";
import { UpdateBanner } from "./UpdateBanner";
import { useColorScheme } from "@/hooks/use-color-scheme";

const UPDATE_DISMISS_KEY = "samaye_update_dismissed";

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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check for updates and changelog on auth change
  useEffect(() => {
    if (!firebaseUser) return;

    let mounted = true;

    const check = async () => {
      try {
        // Load preferences
        const prefs = await obtenirPreferencesNotifications();
        if (!mounted) return;
        setUpdatesEnabled(prefs.updates);

        if (!prefs.updates) return;

        // Check for new app version
        const updateInfo = await checkForUpdate();
        if (!mounted) return;

        if (updateInfo?.updateAvailable) {
          // Check if user already dismissed this version
          const dismissed = await AsyncStorage.getItem(UPDATE_DISMISS_KEY);
          if (dismissed === updateInfo.latestVersion && !updateInfo.forceUpdate) {
            // Already dismissed, don't show again
          } else {
            setLatestVersion(updateInfo.latestVersion);
            setStoreUrl(updateInfo.storeUrl);
            setForceUpdate(updateInfo.forceUpdate);
            setShowBanner(true);
          }
        }

        // Check for unseen changelog
        const currentVersion = getCurrentVersion();
        const userContent = await getUserContentState();
        if (!mounted) return;

        const unseenChangelogs = CHANGELOG.filter(
          (entry) => !userContent.seenChangelog.includes(entry.version),
        );

        // Only show changelog for current version (just updated)
        const currentChangelog = unseenChangelogs.find(
          (entry) => entry.version === currentVersion,
        );

        if (currentChangelog) {
          setShowChangelog(true);
        }
      } catch {
        // Silent failure
      }
    };

    check();
    return () => {
      mounted = false;
    };
  }, [firebaseUser]);

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
