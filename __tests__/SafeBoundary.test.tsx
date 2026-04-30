// __tests__/SafeBoundary.test.tsx
// S3-T7 — granular error boundary used to isolate chart / modal crashes.

import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

import { SafeBoundary } from "../components/SafeBoundary";

function Boom({ message = "kaboom" }: { message?: string }): React.ReactElement {
  throw new Error(message);
}

describe("SafeBoundary", () => {
  // React logs the caught error during a render. Silence the noise so it does
  // not pollute the test output — we still assert the Sentry capture below.
  let consoleErrorSpy: jest.SpyInstance;
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when nothing throws", () => {
    const { getByText } = render(
      <SafeBoundary name="test.ok">
        <Text>healthy</Text>
      </SafeBoundary>,
    );
    expect(getByText("healthy")).toBeTruthy();
  });

  it("renders the default fallback when a child throws", () => {
    const { getByText } = render(
      <SafeBoundary name="test.crash">
        <Boom />
      </SafeBoundary>,
    );
    expect(getByText("Affichage indisponible")).toBeTruthy();
  });

  it("renders a custom fallback node when provided", () => {
    const { getByText } = render(
      <SafeBoundary name="test.custom" fallback={<Text>nope</Text>}>
        <Boom />
      </SafeBoundary>,
    );
    expect(getByText("nope")).toBeTruthy();
  });

  it("renders a fallback function with the captured error", () => {
    const { getByText } = render(
      <SafeBoundary
        name="test.fn"
        fallback={(err) => <Text>err:{err.message}</Text>}
      >
        <Boom message="abc" />
      </SafeBoundary>,
    );
    expect(getByText("err:abc")).toBeTruthy();
  });

  it("captures the error to Sentry with a boundary tag", () => {
    const Sentry = require("@sentry/react-native");
    const setTag = jest.fn();
    const setExtras = jest.fn();
    (Sentry.withScope as jest.Mock).mockImplementation(
      (cb: (scope: { setTag: jest.Mock; setExtras: jest.Mock }) => void) =>
        cb({ setTag, setExtras }),
    );

    render(
      <SafeBoundary name="test.tag" extras={{ childId: "c1" }}>
        <Boom />
      </SafeBoundary>,
    );

    expect(setTag).toHaveBeenCalledWith("boundary", "test.tag");
    expect(setExtras).toHaveBeenCalledWith(
      expect.objectContaining({ childId: "c1" }),
    );
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
