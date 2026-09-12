import { useSelector } from '@tanstack/react-store';
import { TodoFilters } from '../../components/todo/TodoFilters';
import { todoCountsAtom, todoStore } from '../store/todoStore';

export function FilterControls() {
  const searchTerm = useSelector(todoStore, (state) => state.searchTerm);
  const filterStatus = useSelector(todoStore, (state) => state.filterStatus);
  const counts = useSelector(todoCountsAtom);

  return (
    <TodoFilters
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      counts={counts}
      onSearchChange={todoStore.actions.setSearchTerm}
      onFilterChange={todoStore.actions.setFilterStatus}
    />
  );
}
