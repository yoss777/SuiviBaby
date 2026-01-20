// contexts/SheetContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
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
  const pendingDismissRef = useRef<(() => void) | null>(null);

  const openSheet = useCallback((props: SheetViewProps) => {
    setViewProps((prev) => {
      if (prev?.ownerId && prev.ownerId !== props.ownerId) {
        pendingDismissRef.current = prev.onDismiss ?? null;
      }
      return props;
    });
  }, []);

  const closeSheet = useCallback(() => {
    setViewProps((prev) => {
      pendingDismissRef.current = prev?.onDismiss ?? null;
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pendingDismissRef.current) return;
    const dismiss = pendingDismissRef.current;
    pendingDismissRef.current = null;
    dismiss();
  }, [viewProps]);

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
