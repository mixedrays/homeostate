import { observer } from 'mobx-react-lite';
import { useStore } from '../store/StoreContext';
import { TodoItem } from './TodoItem';

export const TodoList = observer(function TodoList() {
  const { todoStore } = useStore();

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        {todoStore.activeTodosCount}{' '}
        {todoStore.activeTodosCount === 1 ? 'task' : 'tasks'} remaining
      </div>

      {todoStore.filteredTodos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {todoStore.searchTerm
            ? 'No todos match your search'
            : todoStore.filterStatus === 'completed'
            ? 'No completed todos'
            : todoStore.filterStatus === 'active'
            ? 'No active todos'
            : 'No todos yet'}
        </div>
      ) : (
        <div className="space-y-2">
          {todoStore.filteredTodos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      )}
    </div>
  );
});
