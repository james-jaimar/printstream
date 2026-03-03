import React, { createContext, useContext } from "react";
import { useUserRole } from "@/hooks/tracker/useUserRole";

interface ReadOnlyContextValue {
  isReadOnly: boolean;
}

const ReadOnlyContext = createContext<ReadOnlyContextValue>({ isReadOnly: false });

export const useReadOnly = () => useContext(ReadOnlyContext);

export const ReadOnlyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userRole } = useUserRole();
  const isReadOnly = userRole === 'viewer';

  return (
    <ReadOnlyContext.Provider value={{ isReadOnly }}>
      {children}
    </ReadOnlyContext.Provider>
  );
};
