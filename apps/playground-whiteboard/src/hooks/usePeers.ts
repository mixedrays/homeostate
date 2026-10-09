import { useEffect, useState } from "react";
import { readPeers, type Awareness, type Peer } from "../board/presence";

/** Everyone in the room, re-read whenever someone joins, leaves, renames or moves. */
export function usePeers(awareness: Awareness): Peer[] {
  const [peers, setPeers] = useState(() => readPeers(awareness));

  useEffect(() => {
    const update = () => setPeers(readPeers(awareness));
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [awareness]);

  return peers;
}
