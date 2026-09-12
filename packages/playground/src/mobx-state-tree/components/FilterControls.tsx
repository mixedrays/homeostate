import { observer } from 'mobx-react-lite';
import { TodoFilters } from '../../components/todo/TodoFilters';
import { todoStore } from '../store/TodoStore';

export const FilterControls = observer(function FilterControls() {
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
