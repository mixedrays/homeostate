import { observer } from 'mobx-react-lite';
import { TodoFilters } from '../../components/todo/TodoFilters';
import { useStore } from '../store/storeContext';

export const FilterControls = observer(function FilterControls() {
  const { todoStore } = useStore();

  return (
    <TodoFilters
      searchTerm={todoStore.searchTerm}
      filterStatus={todoStore.filterStatus}
      counts={todoStore.counts}
      onSearchChange={todoStore.setSearchTerm}
      onFilterChange={todoStore.setFilterStatus}
    />
  );
});
