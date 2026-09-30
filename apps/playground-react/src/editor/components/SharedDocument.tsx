import { useEffect, useRef } from "react";
import type { Transaction } from "yjs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { usePeers } from "../hooks/usePeers";
import {
  readSelection,
  resolveCursor,
  resolveLocalCursor,
  setLocalCursor,
  type Peer,
  type Selection,
} from "../presence";
import {
  awareness,
  identity,
  text,
  useEditorStore,
  ydoc,
} from "../store/useEditorStore";
import {
  CollaborativeTextarea,
  type RemoteCursor,
} from "./CollaborativeTextarea";
import { NameField } from "./NameField";
import { PeerList } from "./PeerList";

const publishCursor = (selection: Selection | null) =>
  setLocalCursor(awareness, text, selection);

const mapSelection = () => resolveLocalCursor(awareness, text);

/**
 * Other writers' selections as offsets into the text as it is now. Resolved on every render,
 * so a caret moves with the text typed before it without waiting for its owner to report.
 */
const remoteCursors = (peers: readonly Peer[]): RemoteCursor[] =>
  peers.flatMap((peer) => {
    const selection = peer.isLocal ? null : resolveCursor(text, peer.cursor);
    return selection
      ? [
          {
            id: peer.clientId,
            name: peer.name,
            color: peer.color,
            ...selection,
          },
        ]
      : [];
  });

export function SharedDocument() {
  const value = useEditorStore((state) => state.text);
  const setText = useEditorStore((state) => state.setText);
  const peers = usePeers(awareness);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // The browser reports a moved caret a task after it moves, and an edit from another tab can
  // land in between; the caret would then be put back where it was before the move. So just
  // before each remote edit, while the textarea still shows the text its offsets refer to, the
  // caret is pinned to the characters around it.
  useEffect(() => {
    const pin = (transaction: Transaction) => {
      const el = textarea.current;
      if (transaction.local || !el || el !== document.activeElement) return;
      if (el.value === useEditorStore.getState().text)
        publishCursor(readSelection(el));
    };
    ydoc.on("beforeTransaction", pin);
    return () => ydoc.off("beforeTransaction", pin);
  }, []);

  return (
    <Card role="region" aria-label="Shared document">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <NameField awareness={awareness} identity={identity} />
          <PeerList peers={peers} />
        </div>
      </CardHeader>
      <CardContent>
        <CollaborativeTextarea
          ref={textarea}
          value={value}
          cursors={remoteCursors(peers)}
          label="Shared document text"
          onChange={setText}
          onSelectionChange={publishCursor}
          mapSelection={mapSelection}
        />
      </CardContent>
    </Card>
  );
}
