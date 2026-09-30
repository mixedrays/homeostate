import { useId, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  readStoredName,
  setLocalUser,
  storeName,
  toUser,
  type Awareness,
  type Identity,
} from "../presence";

interface NameFieldProps {
  awareness: Awareness;
  identity: Identity;
}

/** The name this tab writes under. Left empty, the tab goes by its generated anonymous name. */
export function NameField({ awareness, identity }: NameFieldProps) {
  const [name, setName] = useState(readStoredName);
  const inputId = useId();
  const hintId = useId();

  const rename = (next: string) => {
    setName(next);
    storeName(next);
    setLocalUser(awareness, toUser(identity, next));
  };

  return (
    <div className="grid w-full gap-2 sm:max-w-64">
      <Label htmlFor={inputId}>Your name</Label>
      <InputGroup className="h-9">
        <InputGroupAddon>
          <span
            aria-hidden
            className="size-3 rounded-full"
            style={{ backgroundColor: identity.color }}
          />
        </InputGroupAddon>
        <InputGroupInput
          id={inputId}
          type="text"
          value={name}
          onChange={(event) => rename(event.target.value)}
          placeholder={identity.anonymousName}
          aria-describedby={hintId}
          autoComplete="off"
          maxLength={32}
        />
      </InputGroup>
      <p id={hintId} className="text-xs text-muted-foreground">
        Leave it empty to stay anonymous.
      </p>
    </div>
  );
}
