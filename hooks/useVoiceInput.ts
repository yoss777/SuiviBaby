// hooks/useVoiceInput.ts
// Interaction layer shared by the voice entry points (VoiceDock): free-tier
// quota, hold-to-talk gesture with a tap-to-toggle alternative, drag-out
// cancellation, recording duration with an automatic stop, cancellation when
// the app goes to background or the active child changes, and a single
// derived status. Recording, transcription and parsing stay in useVoiceCommand.

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useBaby } from "@/contexts/BabyContext";
import { usePremium } from "@/contexts/PremiumContext";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { getVoiceUsageStatus } from "@/services/premiumUsageService";
import { hasSeenVoiceNotice, markVoiceNoticeSeen } from "@/services/voiceNoticeService";

export type VoiceInputStatus = "idle" | "recording" | "processing" | "confirming";

/** A press shorter than this starts a hands-free recording, stopped by a second tap. */
export const TAP_TO_TOGGLE_MAX_MS = 350;
/** Recordings are sent automatically after this duration (forgotten hands-free mic). */
export const MAX_RECORDING_SECONDS = 60;

export function getVoiceInputStatus(voice: {
  isRecording: boolean;
  isProcessing: boolean;
  confirmModal: { visible: boolean };
}): VoiceInputStatus {
  if (voice.confirmModal.visible) return "confirming";
  if (voice.isRecording) return "recording";
  if (voice.isProcessing) return "processing";
  return "idle";
}

export function formatRecordingDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function useVoiceInput() {
  const { activeChild } = useBaby();
  const voice = useVoiceCommand(activeChild?.id || "", false);
  const { checkFeatureAccess } = usePremium();

  const [voiceLimitReached, setVoiceLimitReached] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [voiceNoticeVisible, setVoiceNoticeVisible] = useState(false);

  const pressStartedAtRef = useRef(0);
  // Set when a press stopped a hands-free recording, so its release is ignored.
  const pressConsumedRef = useRef(false);
  // Latest voice API for listeners registered once (AppState, child change).
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const status = getVoiceInputStatus(voice);

  const cancel = useCallback(() => {
    if (!voiceRef.current.isRecording) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    voiceRef.current.cancelRecording();
  }, []);

  useEffect(() => {
    if (!voice.isRecording) {
      setElapsedSeconds(0);
      setIsHandsFree(false);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [voice.isRecording]);

  const autoStoppedRef = useRef(false);
  useEffect(() => {
    if (!voice.isRecording) {
      autoStoppedRef.current = false;
      return;
    }
    if (elapsedSeconds >= MAX_RECORDING_SECONDS && !autoStoppedRef.current) {
      autoStoppedRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      voiceRef.current.stopVoiceCommand();
    }
  }, [elapsedSeconds, voice.isRecording]);

  // Never keep the microphone open behind the user's back.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => sub?.remove();
  }, [cancel]);

  // The recording belongs to the child that was active when it started.
  const childId = activeChild?.id;
  const previousChildIdRef = useRef(childId);
  useEffect(() => {
    if (previousChildIdRef.current !== childId) cancel();
    previousChildIdRef.current = childId;
  }, [childId, cancel]);

  const checkVoiceLimit = useCallback(async (): Promise<boolean> => {
    if (checkFeatureAccess("unlimited_voice")) return true;
    const quota = await getVoiceUsageStatus();
    if (!quota.allowed || (quota.remaining ?? 0) <= 0) {
      setVoiceLimitReached(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return false;
    }
    return true;
  }, [checkFeatureAccess]);

  /** Closes the first-use notice for good; the next press records. */
  const dismissVoiceNotice = useCallback(() => {
    setVoiceNoticeVisible(false);
    void markVoiceNoticeSeen();
  }, []);

  const onPressIn = async () => {
    pressStartedAtRef.current = Date.now();
    pressConsumedRef.current = false;
    if (voice.isProcessing || voice.testMode) return;

    if (voice.isRecording && isHandsFree) {
      pressConsumedRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      voice.stopVoiceCommand();
      return;
    }

    setIsHandsFree(false);
    if (!(await checkVoiceLimit())) {
      pressConsumedRef.current = true;
      return;
    }
    // First use: say what is sent and to whom before any audio is captured.
    if (!(await hasSeenVoiceNotice())) {
      pressConsumedRef.current = true;
      setVoiceNoticeVisible(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    voice.startVoiceCommand();
  };

  /** @param releasedOutside the finger left the bar: cancel instead of sending. */
  const onPressOut = (releasedOutside = false) => {
    if (voice.isProcessing || voice.testMode || pressConsumedRef.current) return;
    if (releasedOutside) {
      cancel();
      return;
    }
    const heldMs = Date.now() - pressStartedAtRef.current;
    if (heldMs < TAP_TO_TOGGLE_MAX_MS) {
      // Short tap: keep listening until the next tap (accessibility, one-handed use).
      setIsHandsFree(true);
      return;
    }
    if (voice.isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      voice.stopVoiceCommand();
    }
  };

  // Test mode has no microphone: a plain tap opens the text prompt.
  const onPress = async () => {
    if (!voice.testMode || voice.isProcessing) return;
    if (!(await checkVoiceLimit())) return;
    voice.startVoiceCommand();
  };

  return {
    voice,
    status,
    elapsedSeconds,
    isHandsFree,
    voiceLimitReached,
    setVoiceLimitReached,
    voiceNoticeVisible,
    dismissVoiceNotice,
    onPressIn,
    onPressOut,
    onPress,
    cancel,
  };
}

export type VoiceInput = ReturnType<typeof useVoiceInput>;
