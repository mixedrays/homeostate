import type { ComponentType } from 'react';
import { CheckCheck, CircleDashed, Inbox, SearchX } from 'lucide-react';
import type { FilterStatus, Todo } from '../../types/todo';
import type { TodoCounts } from '../../lib/todos';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { TodoItem, type TodoItemProps } from './TodoItem';

interface TodoListViewProps {
  todos: readonly Todo[];
  counts: TodoCounts;
  searchTerm: string;
  filterStatus: FilterStatus;
  onToggle: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /**
   * The row component, memoized by default. A store that mutates its todos in place instead
   * of replacing them hands its own reactive row here, so the row subscribes to the todo it
   * was given rather than waiting for a new object to arrive as a prop.
   */
  itemComponent?: ComponentType<TodoItemProps>;
}

export function TodoListView({
  todos,
  counts,
  searchTerm,
  filterStatus,
  onToggle,
  onEdit,
  onDelete,
  itemComponent: Item = TodoItem,
}: TodoListViewProps) {
  const hiddenCount = counts.all - todos.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold tabular-nums text-foreground">{counts.active}</span>{' '}
          {counts.active === 1 ? 'todo' : 'todos'} left
        </p>
        {hiddenCount > 0 && <p className="tabular-nums">{hiddenCount} hidden by filters</p>}
      </div>

      {todos.length === 0 ? (
        <EmptyState {...emptyStateFor(counts, searchTerm, filterStatus)} />
      ) : (
        <ul className="space-y-2">
          {todos.map((todo) => (
            <Item
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function emptyStateFor(
  counts: TodoCounts,
  searchTerm: string,
  filterStatus: FilterStatus
): EmptyStateProps {
  const term = searchTerm.trim();
  if (counts.all === 0) {
    return { icon: Inbox, title: 'No todos yet', hint: 'Add your first todo above.' };
  }
  if (term) {
    return { icon: SearchX, title: 'No matches', hint: `Nothing matches “${term}”.` };
  }
  if (filterStatus === 'active') {
    return { icon: CheckCheck, title: 'All done', hint: 'Every todo is completed.' };
  }
  return {
    icon: CircleDashed,
    title: 'Nothing completed yet',
    hint: 'Check off a todo to see it here.',
  };
}
