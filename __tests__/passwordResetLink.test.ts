import { isValidOobCode, parseResetPasswordUrl } from "@/utils/passwordResetLink";

const CODE = "AbCdEf0123456789_-AbCdEf0123456789";

describe("isValidOobCode", () => {
  it("accepts URL-safe tokens", () => {
    expect(isValidOobCode(CODE)).toBe(true);
  });
  it.each([
    undefined,
    null,
    "",
    "short",
    ["a".repeat(20)],
    42,
    "has space 0123456789",
    "../../etc/passwd0123",
    "code<script>0123456789",
    "unicode-é-0123456789",
    "a".repeat(513),
  ])("rejects %p", (value) => {
    expect(isValidOobCode(value)).toBe(false);
  });
  it("accepts the length bounds", () => {
    expect(isValidOobCode("a".repeat(10))).toBe(true);
    expect(isValidOobCode("a".repeat(512))).toBe(true);
  });
});

describe("parseResetPasswordUrl", () => {
  it("reads the custom scheme link", () => {
    expect(parseResetPasswordUrl(`suivibaby://reset-password?oobCode=${CODE}`)).toBe(CODE);
  });
  it("reads the Firebase action link and the App Link", () => {
    expect(
      parseResetPasswordUrl(`https://samaye-53723.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${CODE}&lang=fr`),
    ).toBe(CODE);
    expect(parseResetPasswordUrl(`https://samaye-53723.web.app/reset-password?oobCode=${CODE}`)).toBe(CODE);
  });
  it("ignores other action modes", () => {
    expect(parseResetPasswordUrl(`https://x.test/__/auth/action?mode=verifyEmail&oobCode=${CODE}`)).toBeNull();
  });
  it("rejects malformed codes", () => {
    expect(parseResetPasswordUrl("suivibaby://reset-password?oobCode=abc")).toBeNull();
    expect(parseResetPasswordUrl("suivibaby://reset-password?oobCode=%E0%A4%A")).toBeNull();
    expect(parseResetPasswordUrl(`suivibaby://reset-password?oobCode=${CODE}%2F..%2F`)).toBeNull();
    expect(parseResetPasswordUrl("suivibaby://reset-password?oobCode=")).toBeNull();
  });
  it("rejects non reset URLs, empty and oversized input", () => {
    expect(parseResetPasswordUrl("suivibaby://settings")).toBeNull();
    expect(parseResetPasswordUrl(null)).toBeNull();
    expect(parseResetPasswordUrl(undefined)).toBeNull();
    expect(parseResetPasswordUrl(`suivibaby://r?oobCode=${CODE}&x=${"a".repeat(3000)}`)).toBeNull();
  });
});
