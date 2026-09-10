import { TodoFilters } from '../../components/todo/TodoFilters';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectFilterStatus, selectSearchTerm, selectTodoCounts } from '../store/selectors';
import { setFilterStatus, setSearchTerm } from '../store/todoStore';

export function FilterControls() {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectSearchTerm);
  const filterStatus = useAppSelector(selectFilterStatus);
  const counts = useAppSelector(selectTodoCounts);

  return (
    <TodoFilters
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      counts={counts}
      onSearchChange={(term) => dispatch(setSearchTerm(term))}
      onFilterChange={(status) => dispatch(setFilterStatus(status))}
    />
  );
}
