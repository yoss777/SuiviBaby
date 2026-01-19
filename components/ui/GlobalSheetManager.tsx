// components/ui/GlobalSheetManager.tsx
import React, { useRef, useEffect } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSheet } from '@/contexts/SheetContext';
import { FormBottomSheet } from './FormBottomSheet';

export const GlobalSheetManager = () => {
  const { isOpen, viewProps, closeSheet } = useSheet();
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(1);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  const activeProps = viewProps ?? {
    title: '',
    children: null,
    showActions: false,
    onSubmit: () => {},
  };

  return (
    <FormBottomSheet
      ref={sheetRef}
      // Pass all the dynamic properties for the form
      {...activeProps}
      // Override onCancel and onClose to ensure they always trigger the context's close function
      onCancel={closeSheet}
      onClose={closeSheet}
    />
  );
};
