import { Check, Trash2 } from 'lucide-react';
import type { Todo } from '../../types/todo';
import { buttonIcon, cx } from '../ui/classes';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white pr-2 transition hover:border-slate-300">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 pl-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cx(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2',
            todo.completed
              ? 'border-accent-600 bg-accent-600 text-white'
              : 'border-slate-300 text-transparent group-hover:border-accent-500'
          )}
        >
          <Check size={12} strokeWidth={3} />
        </span>
        <span
          className={cx(
            'min-w-0 flex-1 break-words text-sm sm:text-base',
            todo.completed ? 'text-slate-400 line-through' : 'text-slate-800'
          )}
        >
          {todo.title}
        </span>
      </label>

      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete "${todo.title}"`}
        className={cx(buttonIcon, 'h-8 w-8 shrink-0 hover:bg-red-50 hover:text-red-600')}
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </li>
  );
}
