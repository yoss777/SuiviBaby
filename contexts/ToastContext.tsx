import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "@gorhom/portal";

type ToastContextValue = {
  showToast: (
    message: string,
    durationMs?: number,
    position?: "top" | "bottom"
  ) => void;
};

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (text: string, durationMs = 2600, toastPosition: "top" | "bottom" = "bottom") => {
    setMessage(text);
    setPosition(toastPosition);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
      timeoutRef.current = null;
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <Portal>
          <View
            pointerEvents="none"
            style={[
              styles.toast,
              position === "top"
                ? { top: insets.top + 16 }
                : { bottom: insets.bottom + 24 },
            ]}
          >
            <Text style={styles.toastText}>{message}</Text>
          </View>
        </Portal>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(20, 20, 20, 0.92)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: "90%",
    zIndex: 99999,
    elevation: 99999,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
