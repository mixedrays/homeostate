import { createContext, useContext } from 'react';
import { todoStore } from './TodoStore';

export const StoreContext = createContext({ todoStore });

export const useStore = () => useContext(StoreContext);
