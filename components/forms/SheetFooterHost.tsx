// components/forms/SheetFooterHost.tsx
// Rendu du pied collant dans le `footerComponent` de @gorhom/bottom-sheet.
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { BottomSheetFooter, type BottomSheetFooterProps } from "@gorhom/bottom-sheet";
import React, { useSyncExternalStore } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SheetFooterStore } from "./sheetFooterStore";

function useFooterNode(store: SheetFooterStore) {
  return useSyncExternalStore(store.subscribe, store.getNode, store.getNode);
}

/** Rendu du pied dans la feuille (`footerComponent`). */
export function SheetFooterHost({
  store,
  ...footerProps
}: BottomSheetFooterProps & { store: SheetFooterStore }) {
  const node = useFooterNode(store);
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const insets = useSafeAreaInsets();
  if (!node) return null;
  const onLayout = (e: LayoutChangeEvent) => store.setHeight(e.nativeEvent.layout.height);
  return (
    <BottomSheetFooter {...footerProps}>
      <View
        onLayout={onLayout}
        style={[
          styles.footer,
          {
            backgroundColor: nc.backgroundCard,
            borderTopColor: nc.border,
            paddingBottom: Math.max(12, insets.bottom),
          },
        ]}
      >
        {node}
      </View>
    </BottomSheetFooter>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
