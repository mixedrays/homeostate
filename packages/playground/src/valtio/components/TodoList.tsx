import { useSnapshot } from 'valtio';
import { TodoListView } from '../../components/todo/TodoListView';
import { countTodos, filterTodos } from '../../lib/todos';
import { todoActions, todoState } from '../store/todoState';

export function TodoList() {
  const { todos, searchTerm, filterStatus } = useSnapshot(todoState);

  return (
    <TodoListView
      todos={filterTodos(todos, searchTerm, filterStatus)}
      counts={countTodos(todos)}
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      onToggle={todoActions.toggleTodo}
      onDelete={todoActions.deleteTodo}
    />
  );
}
