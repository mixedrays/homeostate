import { useId, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { buttonPrimary, cx, inputBase } from '../ui/classes';

interface TodoComposerProps {
  onAdd: (title: string) => void;
}

export function TodoComposer({ onAdd }: TodoComposerProps) {
  const [title, setTitle] = useState('');
  const inputId = useId();
  const trimmed = title.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor={inputId} className="sr-only">
        New todo
      </label>
      <input
        id={inputId}
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What needs to be done?"
        autoComplete="off"
        maxLength={200}
        className={cx(inputBase, 'h-11 flex-1 px-4')}
      />
      <button type="submit" disabled={!trimmed} className={cx(buttonPrimary, 'h-11 shrink-0')}>
        <Plus size={18} aria-hidden />
        Add
      </button>
    </form>
  );
}
