import { createSelector } from '@reduxjs/toolkit';
import { countTodos, filterTodos } from '../../lib/todos';
import type { RootState } from './todoStore';

export const selectTodos = (state: RootState) => state.todos;
export const selectSearchTerm = (state: RootState) => state.searchTerm;
export const selectFilterStatus = (state: RootState) => state.filterStatus;

export const selectVisibleTodos = createSelector(
  [selectTodos, selectSearchTerm, selectFilterStatus],
  filterTodos
);

export const selectTodoCounts = createSelector([selectTodos], countTodos);
