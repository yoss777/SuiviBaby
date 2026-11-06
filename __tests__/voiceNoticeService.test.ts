import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  VOICE_NOTICE_SEEN_KEY,
  hasSeenVoiceNotice,
  markVoiceNoticeSeen,
} from "@/services/voiceNoticeService";

describe("voiceNoticeService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is not seen until marked", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    expect(await hasSeenVoiceNotice()).toBe(false);
    await markVoiceNoticeSeen();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(VOICE_NOTICE_SEEN_KEY, "1");
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("1");
    expect(await hasSeenVoiceNotice()).toBe(true);
  });

  it("never blocks voice when storage fails", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    expect(await hasSeenVoiceNotice()).toBe(true);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(markVoiceNoticeSeen()).resolves.toBeUndefined();
  });
});
