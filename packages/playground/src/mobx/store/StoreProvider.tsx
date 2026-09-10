import type { ReactNode } from 'react';
import { todoStore } from './TodoStore';
import { StoreContext } from './storeContext';

export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={{ todoStore }}>{children}</StoreContext.Provider>;
}
