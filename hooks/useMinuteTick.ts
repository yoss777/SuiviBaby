// hooks/useMinuteTick.ts
//
// Drives a once-a-minute clock for components that display "time since X"
// or need to react to a calendar-day rollover, while also handling the
// foreground transition: when the app comes back to active, the clock is
// resnapped to wall time so cached "5 min ago" labels do not lie after a
// long backgrounding.
//
// Extracted from home.tsx (S3-T1b). Self-contained: owns its state, its
// timer, and the AppState subscription. Returns the current Date and the
// current calendar key (`YYYY-M-D`) so callers can memo on day rollovers
// without re-deriving them.

import { useEffect, useState } from "react";
import { AppState } from "react-native";

function calendarKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function useMinuteTick(): { currentTime: Date; currentDay: string } {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [currentDay, setCurrentDay] = useState(() => calendarKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now);
      const newDay = calendarKey(now);
      setCurrentDay((prev) => (prev !== newDay ? newDay : prev));
      scheduleNextUpdate();
    };

    const scheduleNextUpdate = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      const msUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      timer = setTimeout(updateTime, msUntilNextMinute);
    };

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState !== "active") return;
      const now = new Date();
      setCurrentTime(now);
      const newDay = calendarKey(now);
      setCurrentDay((prev) => (prev !== newDay ? newDay : prev));
      scheduleNextUpdate();
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    updateTime();

    return () => {
      if (timer) clearTimeout(timer);
      subscription?.remove();
    };
  }, []);

  return { currentTime, currentDay };
}
