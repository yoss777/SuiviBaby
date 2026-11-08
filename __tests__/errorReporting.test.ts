import * as Sentry from "@sentry/react-native";

const { captureServiceError } = jest.requireActual("@/utils/errorReporting");

jest.mock("@sentry/react-native", () => ({
  withScope: jest.fn((fn: (scope: unknown) => void) =>
    fn({ setTag: jest.fn(), setExtras: jest.fn() }),
  ),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

describe("captureServiceError", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps a lost connection as a breadcrumb only", () => {
    captureServiceError(
      { code: "unavailable", message: "Failed to get documents from server." },
      { service: "events", operation: "obtenirEvenements" },
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: "events", level: "warning" }),
    );
  });

  it("reports other errors with their tags", () => {
    captureServiceError(
      { code: "permission-denied", message: "Missing or insufficient permissions." },
      { service: "promo", operation: "getUserPromoState" },
    );
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
