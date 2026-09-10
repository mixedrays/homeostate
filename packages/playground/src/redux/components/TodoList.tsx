import { TodoListView } from '../../components/todo/TodoListView';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  selectFilterStatus,
  selectSearchTerm,
  selectTodoCounts,
  selectVisibleTodos,
} from '../store/selectors';
import { deleteTodo, toggleTodo } from '../store/todoStore';

export function TodoList() {
  const dispatch = useAppDispatch();
  const todos = useAppSelector(selectVisibleTodos);
  const counts = useAppSelector(selectTodoCounts);
  const searchTerm = useAppSelector(selectSearchTerm);
  const filterStatus = useAppSelector(selectFilterStatus);

  return (
    <TodoListView
      todos={todos}
      counts={counts}
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      onToggle={(id) => dispatch(toggleTodo(id))}
      onDelete={(id) => dispatch(deleteTodo(id))}
    />
  );
}
