import { useId, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <Label htmlFor={inputId} className="sr-only">
        New todo
      </Label>
      <Input
        id={inputId}
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What needs to be done?"
        autoComplete="off"
        maxLength={200}
        className="h-9 flex-1"
      />
      <Button type="submit" size="lg" disabled={!trimmed}>
        <Plus aria-hidden />
        Add
      </Button>
    </form>
  );
}
