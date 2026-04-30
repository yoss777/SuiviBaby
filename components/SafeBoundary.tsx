// components/SafeBoundary.tsx
//
// Compact ErrorBoundary intended to wrap a *single* failure-prone subtree
// (a Skia chart, a moderation modal, a third-party widget) so a crash there
// degrades gracefully instead of taking down the whole screen via the root
// ErrorBoundary.
//
// Each instance reports its own Sentry exception with a `boundary` tag so
// dashboards can attribute crashes to the specific surface.
//
// Differences with the root ErrorBoundary:
//  - inline fallback (caller-supplied or the default compact one), no
//    full-screen "Relancer l'application" CTA
//  - captures with a tag/extras so failures are filterable in Sentry
//  - the fallback is a leaf — it does not recover automatically; the user
//    keeps interacting with the rest of the screen

import * as Sentry from "@sentry/react-native";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

interface SafeBoundaryProps {
  /** Logical name for Sentry attribution. Required so dashboards can group. */
  name: string;
  children: React.ReactNode;
  /** Optional override for the fallback UI. Receives the captured error. */
  fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
  /** Extra Sentry context (e.g. childId, eventId) when known. */
  extras?: Record<string, unknown>;
}

interface SafeBoundaryState {
  error: Error | null;
}

export class SafeBoundary extends React.Component<
  SafeBoundaryProps,
  SafeBoundaryState
> {
  state: SafeBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SafeBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    Sentry.withScope((scope) => {
      scope.setTag("boundary", this.props.name);
      scope.setExtras({
        componentStack: errorInfo.componentStack,
        ...(this.props.extras ?? {}),
      });
      Sentry.captureException(error);
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return this.props.fallback(error);
    }
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Affichage indisponible</Text>
        <Text style={styles.message}>
          Cet élément n'a pas pu s'afficher. L'équipe a été notifiée.
        </Text>
        {__DEV__ && (
          <Text style={styles.errorText}>{error.message}</Text>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#991b1b",
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    color: "#7f1d1d",
    textAlign: "center",
  },
  errorText: {
    marginTop: 4,
    fontSize: 11,
    color: "#dc2626",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlign: "center",
  },
});
