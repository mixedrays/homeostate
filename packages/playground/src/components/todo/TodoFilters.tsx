import { useId } from 'react';
import { Search, X } from 'lucide-react';
import type { FilterStatus } from '../../types/todo';
import type { TodoCounts } from '../../lib/todos';
import { buttonIcon, cx, focusRing, inputBase } from '../ui/classes';

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

interface TodoFiltersProps {
  searchTerm: string;
  filterStatus: FilterStatus;
  counts: TodoCounts;
  onSearchChange: (term: string) => void;
  onFilterChange: (status: FilterStatus) => void;
}

export function TodoFilters({
  searchTerm,
  filterStatus,
  counts,
  onSearchChange,
  onFilterChange,
}: TodoFiltersProps) {
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <label htmlFor={searchId} className="sr-only">
          Search todos
        </label>
        <Search
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          id={searchId}
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search todos"
          autoComplete="off"
          className={cx(
            inputBase,
            'h-10 pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none'
          )}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className={cx(buttonIcon, 'absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2')}
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="inline-flex self-start rounded-xl bg-slate-100 p-1"
      >
        {FILTER_OPTIONS.map(({ value, label }) => {
          const active = value === filterStatus;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(value)}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition',
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                focusRing
              )}
            >
              {label}
              <span
                className={cx('text-xs tabular-nums', active ? 'text-accent-700' : 'text-slate-400')}
              >
                {counts[value]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
