import { useId, type ReactNode } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface ControlsProps {
  children: ReactNode;
}

/** The single filter row above the content it scopes. */
export function Controls({ children }: ControlsProps) {
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{children}</div>;
}

interface SelectFieldProps<T extends string> {
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T | null;
  onChange(value: NoInfer<T>): void;
  placeholder?: string;
  className?: string;
}

export function SelectField<T extends string>({ label, options, value, onChange, placeholder, className }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <Field orientation="horizontal" className="w-auto">
      <FieldLabel htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        items={options}
      >
        <SelectTrigger id={id} size="sm" className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

interface ChoiceGroupProps<T extends string | number> {
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange(value: NoInfer<T>): void;
}

export function ChoiceGroup<T extends string | number>({ label, options, value, onChange }: ChoiceGroupProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={0}
      value={[String(value)]}
      onValueChange={(next: string[]) => {
        const chosen = options.find((option) => String(option.value) === next[0]);
        if (chosen) onChange(chosen.value);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={String(option.value)}
          value={String(option.value)}
          className="text-muted-foreground aria-pressed:text-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
