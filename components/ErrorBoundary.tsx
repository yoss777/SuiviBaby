import { Colors } from "@/constants/theme";
import * as Sentry from "@sentry/react-native";
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  DevSettings,
} from "react-native";
import { neutralColors } from "@/constants/dashboardColors";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  /** Incrémenté à chaque « Relancer » : remonte tout l'arbre enfant. */
  resetKey: number;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  // « Relancer » : expo-updates n'est pas installé, donc pas de reloadAsync.
  // En développement on recharge le bundle JS (DevSettings.reload) ; en
  // production on remonte entièrement l'arbre (nouvelle `key`) : tous les
  // états locaux des écrans sont recréés, comme après un redémarrage à froid
  // de l'interface.
  private handleReset = () => {
    if (__DEV__ && typeof DevSettings?.reload === "function") {
      DevSettings.reload();
      return;
    }
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.title}>Oups ! Une erreur est survenue</Text>
          <Text style={styles.message}>
            L&apos;application a rencontré un problème inattendu. Nous nous excusons
            pour la gêne occasionnée.
          </Text>
          {__DEV__ && this.state.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {this.state.error.toString()}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Relancer l&apos;application</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: neutralColors.white,
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: neutralColors.textStrong,
    textAlign: "center",
    marginBottom: 12,
    fontFamily: Platform.OS === "ios" ? "System" : undefined,
  },
  message: {
    fontSize: 16,
    color: neutralColors.textLight,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: neutralColors.errorBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    maxWidth: "100%",
  },
  errorText: {
    fontSize: 12,
    color: neutralColors.errorText,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  button: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: Colors.light.onTint,
    fontSize: 16,
    fontWeight: "600",
  },
});
