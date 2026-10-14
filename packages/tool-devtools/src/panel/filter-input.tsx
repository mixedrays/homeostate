import { Search, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

/** A small search field. Escape clears it first, and closes the panel only once empty. */
export function FilterInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1.5 size-3 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || value === "") return;
          event.stopPropagation();
          onChange("");
        }}
        className="h-6 rounded-md pr-6 pl-6 text-xs md:text-xs"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear the filter"
          onClick={() => onChange("")}
          className="absolute top-0 right-0"
        >
          <X />
        </Button>
      )}
    </div>
  );
}
