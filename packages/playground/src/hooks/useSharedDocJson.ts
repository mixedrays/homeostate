import { useCallback, useSyncExternalStore } from 'react';
import type { Doc } from 'yjs';

export function useSharedDocJson(doc: Doc, name: string): string {
  const map = doc.getMap(name);

  const subscribe = useCallback(
    (onChange: () => void) => {
      map.observeDeep(onChange);
      return () => map.unobserveDeep(onChange);
    },
    [map]
  );

  const getSnapshot = useCallback(() => JSON.stringify(map.toJSON(), null, 2), [map]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
