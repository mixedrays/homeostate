import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Todo } from '../../types/todo';

export interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/**
 * The row itself, unmemoized. Exported for `observer()`, which applies its own `memo` and
 * throws on a component that already carries one — see the MobX demo's `TodoList`.
 *
 * The checkbox and the title are separate targets: the checkbox toggles `completed`, the title
 * opens an inline editor over the row. Enter commits, Escape reverts, and clicking away commits
 * whatever is in the field — a blank or unchanged title just closes the editor.
 */
export function TodoItemRow({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  // One piece of state for both questions: `null` is "not editing", a string is the draft.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const titleRef = useRef<HTMLButtonElement>(null);
  // Guards the commit on blur: Escape unmounts a focused input, and whether that also fires
  // `onBlur` is the browser's business, so closing the editor has to be idempotent.
  const editingRef = useRef(false);
  // Enter and Escape put focus back on the title; clicking away deliberately does not.
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      titleRef.current?.focus();
    }
  }, [editing]);

  const startEditing = () => {
    editingRef.current = true;
    setDraft(todo.title);
  };

  const close = () => {
    editingRef.current = false;
    setDraft(null);
  };

  const commit = () => {
    if (!editingRef.current) return;
    const title = draft?.trim() ?? '';
    if (title && title !== todo.title) onEdit(todo.id, title);
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      restoreFocusRef.current = true;
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      restoreFocusRef.current = true;
      close();
    }
  };

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card py-2.5 pl-3 pr-2 transition-colors hover:border-ring">
      <Checkbox
        checked={todo.completed}
        onCheckedChange={() => onToggle(todo.id)}
        aria-label={`Mark "${todo.title}" as ${todo.completed ? 'not completed' : 'completed'}`}
        className="size-5 shrink-0 rounded-full"
      />

      {editing ? (
        <Input
          type="text"
          // Mounted only while editing, so autoFocus runs on the way in rather than on a render.
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          aria-label={`Edit "${todo.title}"`}
          autoComplete="off"
          maxLength={200}
          className="h-8 min-w-0 flex-1 text-sm sm:text-base"
        />
      ) : (
        <button
          ref={titleRef}
          type="button"
          onClick={startEditing}
          aria-label={`Edit "${todo.title}"`}
          className={cn(
            'min-w-0 flex-1 cursor-text break-words rounded-md text-left text-sm leading-snug outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-base',
            todo.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          )}
        >
          {todo.title}
        </button>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete "${todo.title}"`}
        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

/**
 * The row the list renders by default. Memoized, so toggling or editing one todo re-renders one
 * row instead of the whole list — which only holds while the demo above hands down todo objects
 * and callbacks whose identity survives an unrelated change. Every demo but MobX does that
 * already: its store is immutable, so an untouched todo is the same object it was.
 */
export const TodoItem = memo(TodoItemRow);
