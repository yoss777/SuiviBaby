// SheetContext.tsx
import { createContext, useContext, useState } from 'react';

const SheetContext = createContext({
  isOpen: false,
  setIsOpen: (_: boolean) => {},
});

export const SheetProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SheetContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </SheetContext.Provider>
  );
};

export const useSheet = () => useContext(SheetContext);
