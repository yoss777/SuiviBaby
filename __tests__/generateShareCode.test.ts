jest.mock("expo-crypto", () => ({ getRandomBytes: jest.fn((n: number) => Uint8Array.from({ length: n }, (_, i) => i * 37)) }));
import { getRandomBytes } from "expo-crypto";
import { generateShareCode } from "@/services/childSharingService";

describe("generateShareCode", () => {
  it("uses the cryptographic generator and the unambiguous alphabet", () => {
    const code = generateShareCode();
    expect(getRandomBytes).toHaveBeenCalledWith(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    // bytes 0,37,74,111,148,185 → indexes 0,5,10,15,20,25
    expect(code).toBe("AFLRW3");
  });
});
