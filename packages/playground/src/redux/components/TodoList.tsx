import { useAppSelector } from '../store/hooks';
import { TodoItem } from './TodoItem';

export function TodoList() {
  const { todos, searchTerm, filterStatus } = useAppSelector((state) => ({
    todos: state.todos,
    searchTerm: state.searchTerm,
    filterStatus: state.filterStatus,
  }));

  const filteredTodos = todos
    .filter((todo) =>
      todo.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((todo) => {
      if (filterStatus === 'active') return !todo.completed;
      if (filterStatus === 'completed') return todo.completed;
      return true;
    });

  const activeTodosCount = todos.filter((todo) => !todo.completed).length;

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        {activeTodosCount} {activeTodosCount === 1 ? 'task' : 'tasks'} remaining
      </div>

      {filteredTodos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchTerm
            ? 'No todos match your search'
            : filterStatus === 'completed'
            ? 'No completed todos'
            : filterStatus === 'active'
            ? 'No active todos'
            : 'No todos yet'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTodos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      )}
    </div>
  );
}
