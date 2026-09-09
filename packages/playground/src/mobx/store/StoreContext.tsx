import React, { createContext, useContext } from 'react';
import { todoStore } from './TodoStore';

const StoreContext = createContext({ todoStore });

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <StoreContext.Provider value={{ todoStore }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
