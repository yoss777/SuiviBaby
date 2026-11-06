import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  hasSeenVoiceNotice,
  markVoiceNoticeSeen,
  voiceNoticeSeenKey,
} from "@/services/voiceNoticeService";

describe("voiceNoticeService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is not seen until marked, with a key per uid", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    expect(await hasSeenVoiceNotice("u1")).toBe(false);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(voiceNoticeSeenKey("u1"));
    await markVoiceNoticeSeen("u1");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(voiceNoticeSeenKey("u1"), "1");
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("1");
    expect(await hasSeenVoiceNotice("u1")).toBe(true);
  });

  it("uses distinct keys for distinct accounts", () => {
    expect(voiceNoticeSeenKey("u1")).not.toBe(voiceNoticeSeenKey("u2"));
    expect(voiceNoticeSeenKey("u1")).toContain("u1");
  });

  it("does nothing without a uid and never blocks voice", async () => {
    expect(await hasSeenVoiceNotice(null)).toBe(true);
    await markVoiceNoticeSeen(undefined);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("never blocks voice when storage fails", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    expect(await hasSeenVoiceNotice("u1")).toBe(true);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(markVoiceNoticeSeen("u1")).resolves.toBeUndefined();
  });
});
