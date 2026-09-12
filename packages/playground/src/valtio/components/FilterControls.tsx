import { useSnapshot } from 'valtio';
import { TodoFilters } from '../../components/todo/TodoFilters';
import { countTodos } from '../../lib/todos';
import { todoActions, todoState } from '../store/todoState';

export function FilterControls() {
  const { todos, searchTerm, filterStatus } = useSnapshot(todoState);

  return (
    <TodoFilters
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      counts={countTodos(todos)}
      onSearchChange={todoActions.setSearchTerm}
      onFilterChange={todoActions.setFilterStatus}
    />
  );
}
