import { observer } from 'mobx-react-lite';
import { useStore } from '../store/StoreContext';
import { FilterStatus } from '../../types/todo';

export const FilterControls = observer(function FilterControls() {
  const { todoStore } = useStore();

  const filterOptions: FilterStatus[] = ['all', 'active', 'completed'];

  return (
    <div className="space-y-4">
      <h2 className="text-xl">Filters</h2>
      <div className="relative">
        <input
          id="search-input"
          type="text"
          value={todoStore.searchTerm}
          onChange={(e) => todoStore.setSearchTerm(e.target.value)}
          placeholder="Search todos..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      <div className="flex gap-2">
        {filterOptions.map((option) => (
          <button
            key={option}
            onClick={() => todoStore.setFilterStatus(option)}
            className={`px-4 py-2 rounded-lg capitalize transition-colors ${
              todoStore.filterStatus === option
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
});
