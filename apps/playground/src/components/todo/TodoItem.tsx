import { memo } from "react";
import { Circle, CircleCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Todo } from "../../types/todo";

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
 * The check and the title are separate targets: the check toggles `completed`, the title
 * is a field you type straight into. It is always a field — borderless until you touch it —
 * rather than text that swaps for an input on click, because swapping two differently sized
 * boxes is what made the row change height and the list jump. There is one box, so there is
 * nothing to jump. Every keystroke goes to the store, which is also what puts each keystroke
 * on the wire for the other tabs.
 */
export function TodoItemRow({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: TodoItemProps) {
  // The field is free to be empty while it is being retyped, so labels need a fallback.
  const label = todo.title.trim() || "Untitled todo";

  return (
    <li className="flex items-center gap-2 rounded-xl border bg-card px-2 py-2.5 transition-colors hover:border-ring">
      {/* A toggle button rather than a checkbox, to match the delete button across the row.
          `aria-pressed` is what tells a screen reader it is a two-state control. */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onToggle(todo.id)}
        aria-pressed={todo.completed}
        aria-label={`Mark "${label}" as ${todo.completed ? "not completed" : "completed"}`}
        className={cn(
          // Done, it picks up whichever accent the demo is themed with.
          "shrink-0 hover:bg-primary/10 hover:text-primary",
          todo.completed ? "text-primary" : "text-muted-foreground",
        )}
      >
        {/* The two icons draw the same r=10 ring, so the state change reads as a check
            appearing inside it rather than as one shape swapping for another. */}
        {todo.completed ? <CircleCheck aria-hidden /> : <Circle aria-hidden />}
      </Button>

      <Input
        type="text"
        value={todo.title}
        onChange={(event) => onEdit(todo.id, event.target.value)}
        placeholder="Untitled todo"
        // The field carries its value, so the accessible name stays put as the title changes.
        aria-label="Todo title"
        autoComplete="off"
        maxLength={200}
        className={cn(
          // Reads as plain text until it is hovered or focused, where the border it already
          // reserves becomes visible. Nothing here changes the box, only its colours.
          "min-w-0 flex-1 border-transparent px-2 hover:border-input dark:bg-transparent",
          todo.completed && "text-muted-foreground line-through",
        )}
      />

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete "${label}"`}
        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

/**
 * The row the list renders by default. Memoized, so editing or toggling one todo re-renders one
 * row instead of the whole list — which only holds while the demo above hands down todo objects
 * and callbacks whose identity survives an unrelated change. Every demo but MobX does that
 * already: its store is immutable, so an untouched todo is the same object it was.
 */
export const TodoItem = memo(TodoItemRow);
