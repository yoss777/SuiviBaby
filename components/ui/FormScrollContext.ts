import { createContext, useContext } from "react";

type FormScrollContextValue = {
  scrollToEnd: () => void;
};

export const FormScrollContext = createContext<FormScrollContextValue | null>(
  null,
);

export const useFormScroll = () => useContext(FormScrollContext);
