import { parseEmailActionUrl } from "@/utils/passwordResetLink";
const { applyEmailVerificationLink } = jest.requireActual("@/utils/emailVerification");

const CODE = "AbCdEf123456_-xyz";

describe("parseEmailActionUrl", () => {
  it("recognises reset and verification links on the shared action page", () => {
    expect(parseEmailActionUrl(`https://samaye-53723.web.app/reset-password?mode=resetPassword&oobCode=${CODE}&apiKey=x`))
      .toEqual({ mode: "resetPassword", oobCode: CODE });
    expect(parseEmailActionUrl(`https://samaye-53723.web.app/reset-password?mode=verifyEmail&oobCode=${CODE}&apiKey=x`))
      .toEqual({ mode: "verifyEmail", oobCode: CODE });
  });

  it("treats the app deep link without mode as a reset", () => {
    expect(parseEmailActionUrl(`suivibaby://reset-password?oobCode=${CODE}`)).toEqual({ mode: "resetPassword", oobCode: CODE });
  });

  it("ignores other modes and malformed codes", () => {
    expect(parseEmailActionUrl(`https://x/reset-password?mode=recoverEmail&oobCode=${CODE}`)).toBeNull();
    expect(parseEmailActionUrl("https://x/reset-password?mode=verifyEmail&oobCode=<script>")).toBeNull();
    expect(parseEmailActionUrl("https://x/reset-password?mode=verifyEmail")).toBeNull();
  });
});

describe("applyEmailVerificationLink", () => {
  const user = (verified: boolean) => ({
    emailVerified: verified,
    reload: jest.fn().mockResolvedValue(undefined),
    getIdToken: jest.fn().mockResolvedValue("t"),
  });

  it("applies the code and refreshes the signed-in user", async () => {
    const applyCode = jest.fn().mockResolvedValue(undefined);
    const u = user(true);
    await expect(applyEmailVerificationLink(CODE, { applyCode, currentUser: () => u })).resolves.toBe("verified");
    expect(applyCode).toHaveBeenCalledWith(CODE);
    expect(u.getIdToken).toHaveBeenCalledWith(true);
  });

  it("counts an already-used code as success when the address is verified", async () => {
    const applyCode = jest.fn().mockRejectedValue({ code: "auth/invalid-action-code" });
    await expect(applyEmailVerificationLink(CODE, { applyCode, currentUser: () => user(true) })).resolves.toBe("verified");
  });

  it("reports an invalid code when nothing is verified", async () => {
    const applyCode = jest.fn().mockRejectedValue({ code: "auth/expired-action-code" });
    await expect(applyEmailVerificationLink(CODE, { applyCode, currentUser: () => user(false) })).resolves.toBe("invalid");
    await expect(applyEmailVerificationLink(CODE, { applyCode, currentUser: () => null })).resolves.toBe("invalid");
  });

  it("succeeds without a signed-in user when the code applies", async () => {
    const applyCode = jest.fn().mockResolvedValue(undefined);
    await expect(applyEmailVerificationLink(CODE, { applyCode, currentUser: () => null })).resolves.toBe("verified");
  });
});
