import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { MAX_NAME_LENGTH, type Identity } from "../board/presence";

interface JoinDialogProps {
  open: boolean;
  identity: Identity;
  /** The name this tab joined under, or null before it has joined. */
  joinedName: string | null;
  /** Called with the name to go by; an empty one joins anonymously. */
  onJoin: (name: string) => void;
  /** Closes a rename without changing anything. Never called before joining. */
  onCancel: () => void;
}

/**
 * The way onto the board: a name to show next to your cursor, or the tab's generated
 * anonymous one. Until a tab joins it is not in the room's presence, so nobody sees it.
 * After joining, the same dialog renames.
 */
export function JoinDialog({
  open,
  identity,
  joinedName,
  onJoin,
  onCancel,
}: JoinDialogProps) {
  const joined = joinedName !== null;

  // Each opening is a session: the form starts over from the current name, and what the
  // dialog was opened for stays put while it animates closed, rather than flipping to
  // "Change your name" the moment the join lands.
  const [session, setSession] = useState({ open, id: 0, renaming: joined });
  if (open !== session.open)
    setSession({
      open,
      id: open ? session.id + 1 : session.id,
      renaming: open ? joined : session.renaming,
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && joined) onCancel();
      }}
      disablePointerDismissal={!joined}
    >
      <DialogContent showCloseButton={session.renaming}>
        <JoinForm
          key={session.id}
          identity={identity}
          joined={session.renaming}
          initialName={joinedName ?? ""}
          onJoin={onJoin}
        />
      </DialogContent>
    </Dialog>
  );
}

function JoinForm({
  identity,
  joined,
  initialName,
  onJoin,
}: {
  identity: Identity;
  joined: boolean;
  initialName: string;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const inputId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onJoin(name);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {joined ? "Change your name" : "Join the whiteboard"}
        </DialogTitle>
        <DialogDescription>
          Everyone on the board sees your name next to your cursor. You can also
          join anonymously as{" "}
          <span className="font-medium text-foreground">
            {identity.anonymousName}
          </span>
          .
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
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
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="off"
            autoFocus
            maxLength={MAX_NAME_LENGTH}
          />
        </InputGroup>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onJoin("")}>
          {joined ? "Go anonymous" : "Join anonymously"}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {joined ? "Save name" : "Join with this name"}
        </Button>
      </DialogFooter>
    </form>
  );
}
