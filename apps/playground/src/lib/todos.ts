import type { FilterStatus, Todo } from '../types/todo';

export interface TodoCounts {
  all: number;
  active: number;
  completed: number;
}

export function matchesFilter(todo: Todo, filterStatus: FilterStatus): boolean {
  if (filterStatus === 'active') return !todo.completed;
  if (filterStatus === 'completed') return todo.completed;
  return true;
}

export function filterTodos(
  todos: readonly Todo[],
  searchTerm: string,
  filterStatus: FilterStatus
): Todo[] {
  const term = searchTerm.trim().toLowerCase();
  return todos.filter(
    (todo) =>
      matchesFilter(todo, filterStatus) &&
      (term === '' || todo.title.toLowerCase().includes(term))
  );
}

export function countTodos(todos: readonly Todo[]): TodoCounts {
  const active = todos.filter((todo) => !todo.completed).length;
  return { all: todos.length, active, completed: todos.length - active };
}
