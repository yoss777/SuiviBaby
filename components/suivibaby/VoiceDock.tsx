// components/suivibaby/VoiceDock.tsx
// Bottom input dock mounted once in the tabs layout: the hold-to-talk voice
// pill on the left and the quick-add "+" on the right, two separate controls
// whose states are coordinated here:
// - while recording or processing, the "+" is disabled;
// - while the quick-add menu is open, the pill fades under the menu backdrop
//   and ignores touches (tapping the backdrop closes the menu).
import { GlobalFAB } from "@/components/suivibaby/GlobalFAB";
import { useNightMode } from "@/hooks/useNightMode";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useEffect, useState } from "react";
import { VoiceBar, VOICE_BAR_HEIGHT } from "./VoiceBar";
import { VoiceCommandModals } from "./voice/VoiceCommandModals";

const FAB_SIZE = 56;
const FAB_RIGHT = 20;
/** Gap above the tab bar. */
export const DOCK_MARGIN = 10;

/** Bottom padding a scrollable screen needs so its last item clears the dock. */
export const VOICE_DOCK_INSET = VOICE_BAR_HEIGHT + DOCK_MARGIN * 2 + 8;

interface VoiceDockProps {
  /** Height of the tab bar the dock sits on. */
  tabBarHeight: number;
  /**
   * Hidden on tabs without tracking content and while the keyboard is open.
   * The dock stays mounted (one recorder, modals survive tab switches) and
   * cancels any recording when it is hidden.
   */
  visible: boolean;
}

export function VoiceDock({ tabBarHeight, visible }: VoiceDockProps) {
  const input = useVoiceInput();
  const { isNightMode, minButtonSize } = useNightMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cancel } = input;

  useEffect(() => {
    if (visible) return;
    setMenuOpen(false);
    cancel();
  }, [visible, cancel]);

  const bottom = tabBarHeight + DOCK_MARGIN;
  const fabSize = Math.max(minButtonSize, FAB_SIZE);
  // Wider dead zone at night, when the thumb is least precise.
  const gap = isNightMode ? 16 : 12;
  const isVoiceBusy = input.status === "recording" || input.status === "processing";

  return (
    <>
      {visible && (
        <>
          <VoiceBar
            input={input}
            bottom={bottom + (fabSize - VOICE_BAR_HEIGHT) / 2}
            right={FAB_RIGHT + fabSize + gap}
            dimmed={menuOpen}
          />
          <GlobalFAB
            bottom={bottom}
            isOpen={menuOpen}
            onOpenChange={setMenuOpen}
            disabled={isVoiceBusy}
          />
        </>
      )}
      <VoiceCommandModals input={input} />
    </>
  );
}
