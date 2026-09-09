import { useTodoStore } from '../store/useTodoStore';
import { FilterStatus } from '../../types/todo';

export function FilterControls() {
  const { searchTerm, filterStatus, setSearchTerm, setFilterStatus } =
    useTodoStore((state) => ({
      searchTerm: state.searchTerm,
      filterStatus: state.filterStatus,
      setSearchTerm: state.setSearchTerm,
      setFilterStatus: state.setFilterStatus,
    }));

  const filterOptions: FilterStatus[] = ['all', 'active', 'completed'];

  return (
    <div className="space-y-4">
      <h2 className="text-xl">Filters</h2>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search todos..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="flex gap-2">
        {filterOptions.map((option) => (
          <button
            key={option}
            onClick={() => setFilterStatus(option)}
            className={`px-4 py-2 rounded-lg capitalize transition-colors ${
              filterStatus === option
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
