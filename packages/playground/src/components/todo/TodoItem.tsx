import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Todo } from '../../types/todo';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const checkboxId = useId();

  return (
    <li className="flex items-center gap-2 rounded-xl border bg-card pr-2 transition-colors hover:border-ring">
      <Label
        htmlFor={checkboxId}
        className="min-w-0 flex-1 cursor-pointer gap-3 py-2.5 pl-3 font-normal leading-snug"
      >
        <Checkbox
          id={checkboxId}
          checked={todo.completed}
          onCheckedChange={() => onToggle(todo.id)}
          className="size-5 rounded-full"
        />
        <span
          className={cn(
            'min-w-0 flex-1 break-words text-sm sm:text-base',
            todo.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          )}
        >
          {todo.title}
        </span>
      </Label>

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
