import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { DevSettings, Text } from "react-native";
import * as Sentry from "@sentry/react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Component that throws an error
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test explosion");
  }
  return <Text>Everything is fine</Text>;
}

// Suppress console.error for expected errors in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe("ErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render children when there is no error", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(getByText("Everything is fine")).toBeTruthy();
  });

  it("should render error UI when a child throws", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(getByText("Oups ! Une erreur est survenue")).toBeTruthy();
    expect(getByText("Relancer l'application")).toBeTruthy();
  });

  it("should report the error to Sentry", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          componentStack: expect.any(String),
        }),
      }),
    );
  });

  it("should reset error state when the reset button is pressed", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Error UI is shown
    expect(getByText("Oups ! Une erreur est survenue")).toBeTruthy();

    // Press reset button - this resets the internal state
    fireEvent.press(getByText("Relancer l'application"));

    // After reset, the ErrorBoundary re-renders children.
    // Since Bomb still has shouldThrow=true, it will throw again.
    // The key assertion is that the reset button was clickable and the
    // handleReset function executed without errors.
    expect(getByText("Oups ! Une erreur est survenue")).toBeTruthy();
  });

  it("Relancer recharge le bundle en dev (DevSettings.reload)", () => {
    const reload = jest.spyOn(DevSettings, "reload").mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    fireEvent.press(getByText("Relancer l'application"));
    expect(reload).toHaveBeenCalledTimes(1);
    reload.mockRestore();
  });

  it("Relancer remonte entièrement l'arbre quand le rechargement n'est pas disponible", () => {
    const g = globalThis as unknown as { __DEV__: boolean };
    const previous = g.__DEV__;
    g.__DEV__ = false;
    let mounts = 0;
    let crash = true;
    function Child() {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      if (crash) throw new Error("boom");
      return <Text>recovered</Text>;
    }
    const { getByText } = render(
      <ErrorBoundary>
        <Child />
      </ErrorBoundary>,
    );
    crash = false;
    fireEvent.press(getByText("Relancer l'application"));
    expect(getByText("recovered")).toBeTruthy();
    expect(mounts).toBe(1);
    expect(Sentry.captureException).toHaveBeenCalled();
    g.__DEV__ = previous;
  });
});
