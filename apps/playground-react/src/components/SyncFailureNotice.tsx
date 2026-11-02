import { TriangleAlert } from "lucide-react";
import type { SyncEngine } from "@homeostate/core";
import { useSyncStatus } from "@homeostate/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InlineCode } from "./InlineCode";

/**
 * What went wrong in the sync engine, if anything. The badge in the header reports the provider,
 * which the engine knows nothing of, so the two sit side by side.
 */
export function SyncFailureNotice({ engine }: { engine: SyncEngine }) {
  const { failure } = useSyncStatus(engine);
  if (failure === null) return null;
  const { error } = failure;

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>The last change did not sync.</AlertTitle>
      <AlertDescription>
        This store and its document may differ until the next change syncs.{" "}
        <InlineCode>
          {error instanceof Error ? error.message : String(error)}
        </InlineCode>
      </AlertDescription>
    </Alert>
  );
}
