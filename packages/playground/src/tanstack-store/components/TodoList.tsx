import { useSelector } from '@tanstack/react-store';
import { TodoListView } from '../../components/todo/TodoListView';
import { todoCountsAtom, todoStore, visibleTodosAtom } from '../store/todoStore';

export function TodoList() {
  const todos = useSelector(visibleTodosAtom);
  const counts = useSelector(todoCountsAtom);
  const searchTerm = useSelector(todoStore, (state) => state.searchTerm);
  const filterStatus = useSelector(todoStore, (state) => state.filterStatus);

  return (
    <TodoListView
      todos={todos}
      counts={counts}
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      onToggle={todoStore.actions.toggleTodo}
      onDelete={todoStore.actions.deleteTodo}
    />
  );
}
