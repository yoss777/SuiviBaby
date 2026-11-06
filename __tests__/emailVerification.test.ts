import {
  createEmailNotVerifiedError,
  isEmailNotVerifiedError,
  refreshEmailVerification,
  showEmailNotVerifiedAlert,
  VERIFY_EMAIL_ROUTE,
} from "@/utils/emailVerification";

describe("emailVerification", () => {
  it.each([
    [{ code: "functions/failed-precondition", details: { reason: "email-not-verified" } }, true],
    [{ code: "email-not-verified" }, true],
    [{ code: "functions/failed-precondition", details: { reason: "already-linked" } }, false],
    [{ code: "functions/failed-precondition" }, false],
    [null, false],
    [undefined, false],
    ["email-not-verified", false],
  ])("isEmailNotVerifiedError(%j) -> %p", (error, expected) => {
    expect(isEmailNotVerifiedError(error)).toBe(expected);
  });

  it("builds a stable error", () => {
    const error = createEmailNotVerifiedError();
    expect(error.code).toBe("email-not-verified");
    expect(error.message).toBe("Vérifiez votre adresse e-mail pour continuer.");
    expect(isEmailNotVerifiedError(error)).toBe(true);
  });

  it("alert leads to the verify-email screen", () => {
    const showAlert = jest.fn();
    const router = { push: jest.fn() };
    showEmailNotVerifiedAlert(showAlert, router);
    const [, message, buttons] = showAlert.mock.calls[0];
    expect(message).toBe("Vérifiez votre adresse e-mail pour continuer.");
    buttons.find((b: any) => b.onPress).onPress();
    expect(router.push).toHaveBeenCalledWith(VERIFY_EMAIL_ROUTE);
    expect(VERIFY_EMAIL_ROUTE).toBe("/(auth)/verify-email");
  });

  it("refreshEmailVerification reloads then force-refreshes the ID token", async () => {
    const calls: string[] = [];
    const user = {
      emailVerified: true,
      reload: jest.fn(async () => { calls.push("reload"); }),
      getIdToken: jest.fn(async () => { calls.push("token"); return "t"; }),
    };
    await expect(refreshEmailVerification(user)).resolves.toBe(true);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(calls).toEqual(["reload", "token"]);
  });
});
