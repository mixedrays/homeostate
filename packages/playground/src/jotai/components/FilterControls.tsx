import { useAtom, useAtomValue } from 'jotai';
import { TodoFilters } from '../../components/todo/TodoFilters';
import { filterStatusAtom, searchTermAtom, todoCountsAtom } from '../store/todoAtoms';

export function FilterControls() {
  const [searchTerm, setSearchTerm] = useAtom(searchTermAtom);
  const [filterStatus, setFilterStatus] = useAtom(filterStatusAtom);
  const counts = useAtomValue(todoCountsAtom);

  return (
    <TodoFilters
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      counts={counts}
      onSearchChange={setSearchTerm}
      onFilterChange={setFilterStatus}
    />
  );
}
