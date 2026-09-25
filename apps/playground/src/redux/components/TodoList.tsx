import { useCallback } from 'react';
import { TodoListView } from '../../components/todo/TodoListView';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  selectFilterStatus,
  selectSearchTerm,
  selectTodoCounts,
  selectVisibleTodos,
} from '../store/selectors';
import { deleteTodo, editTodo, toggleTodo } from '../store/todoStore';

export function TodoList() {
  const dispatch = useAppDispatch();
  const todos = useAppSelector(selectVisibleTodos);
  const counts = useAppSelector(selectTodoCounts);
  const searchTerm = useAppSelector(selectSearchTerm);
  const filterStatus = useAppSelector(selectFilterStatus);

  // The rows are memoized, and an inline arrow would be a new prop on every render and defeat
  // that. `dispatch` is stable for the life of the store, so these are too.
  const onToggle = useCallback((id: string) => dispatch(toggleTodo(id)), [dispatch]);
  const onEdit = useCallback(
    (id: string, title: string) => dispatch(editTodo({ id, title })),
    [dispatch]
  );
  const onDelete = useCallback((id: string) => dispatch(deleteTodo(id)), [dispatch]);

  return (
    <TodoListView
      todos={todos}
      counts={counts}
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
