import { useId } from 'react';
import { Search, X } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { FilterStatus } from '../../types/todo';
import type { TodoCounts } from '../../lib/todos';

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
      <div className="flex-1">
        <Label htmlFor={searchId} className="sr-only">
          Search todos
        </Label>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            id={searchId}
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search todos"
            autoComplete="off"
            className="[&::-webkit-search-cancel-button]:appearance-none"
          />
          {searchTerm && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
              >
                <X aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>

      <ToggleGroup
        aria-label="Filter by status"
        variant="outline"
        spacing={0}
        value={[filterStatus]}
        onValueChange={(value: string[]) => {
          const next = value[0] as FilterStatus | undefined;
          if (next) onFilterChange(next);
        }}
        className="self-start"
      >
        {FILTER_OPTIONS.map(({ value, label }) => {
          const active = value === filterStatus;
          return (
            <ToggleGroupItem key={value} value={value}>
              {label}
              <span
                className={cn(
                  'text-xs tabular-nums',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {counts[value]}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
