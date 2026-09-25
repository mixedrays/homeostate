import { useShallow } from 'zustand/react/shallow';
import { TodoListView } from '../../components/todo/TodoListView';
import { countTodos, filterTodos } from '../../lib/todos';
import { useTodoStore } from '../store/useTodoStore';

export function TodoList() {
  const { todos, searchTerm, filterStatus, toggleTodo, editTodo, deleteTodo } = useTodoStore(
    useShallow((state) => ({
      todos: state.todos,
      searchTerm: state.searchTerm,
      filterStatus: state.filterStatus,
      toggleTodo: state.toggleTodo,
      editTodo: state.editTodo,
      deleteTodo: state.deleteTodo,
    }))
  );

  return (
    <TodoListView
      todos={filterTodos(todos, searchTerm, filterStatus)}
      counts={countTodos(todos)}
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      onToggle={toggleTodo}
      onEdit={editTodo}
      onDelete={deleteTodo}
    />
  );
}
