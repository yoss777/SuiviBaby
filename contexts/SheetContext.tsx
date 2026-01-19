// contexts/SheetContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import type { FormBottomSheetProps } from '@/components/ui/FormBottomSheet';

// These are the props that a screen needs to provide to open a form sheet.
// We omit onCancel and onClose because they will be handled internally by the global sheet manager.
export type SheetViewProps = Omit<FormBottomSheetProps, 'onCancel' | 'onClose'> & {
  ownerId: string;
  onDismiss?: () => void;
};

interface SheetContextType {
  isOpen: boolean;
  viewProps: SheetViewProps | null;
  openSheet: (props: SheetViewProps) => void;
  closeSheet: () => void;
}

const SheetContext = createContext<SheetContextType | undefined>(undefined);

export const SheetProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewProps, setViewProps] = useState<SheetViewProps | null>(null);

  const openSheet = useCallback((props: SheetViewProps) => {
    setViewProps((prev) => {
      if (prev?.ownerId && prev.ownerId !== props.ownerId) {
        prev.onDismiss?.();
      }
      return props;
    });
  }, []);

  const closeSheet = useCallback(() => {
    setViewProps((prev) => {
      prev?.onDismiss?.();
      return null;
    });
  }, []);

  const value = {
    isOpen: viewProps !== null,
    viewProps,
    openSheet,
    closeSheet,
  };

  return (
    <SheetContext.Provider value={value}>
      {children}
    </SheetContext.Provider>
  );
};

export const useSheet = () => {
  const context = useContext(SheetContext);
  if (context === undefined) {
    throw new Error('useSheet must be used within a SheetProvider');
  }
  return context;
};
