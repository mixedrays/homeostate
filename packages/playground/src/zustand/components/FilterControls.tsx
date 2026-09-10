import { useShallow } from 'zustand/react/shallow';
import { TodoFilters } from '../../components/todo/TodoFilters';
import { countTodos } from '../../lib/todos';
import { useTodoStore } from '../store/useTodoStore';

export function FilterControls() {
  const { todos, searchTerm, filterStatus, setSearchTerm, setFilterStatus } = useTodoStore(
    useShallow((state) => ({
      todos: state.todos,
      searchTerm: state.searchTerm,
      filterStatus: state.filterStatus,
      setSearchTerm: state.setSearchTerm,
      setFilterStatus: state.setFilterStatus,
    }))
  );

  return (
    <TodoFilters
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      counts={countTodos(todos)}
      onSearchChange={setSearchTerm}
      onFilterChange={setFilterStatus}
    />
  );
}
