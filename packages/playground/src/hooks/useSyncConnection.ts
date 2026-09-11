import { useCallback, useEffect, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';

export type SyncStatus = 'connecting' | 'connected' | 'synced' | 'unreachable' | 'offline';

export interface SyncConnection {
  status: SyncStatus;
  online: boolean;
  setOnline: (online: boolean) => void;
  toggle: () => void;
}

function readStatus(provider: WebsocketProvider): SyncStatus {
  if (!provider.shouldConnect) return 'offline';
  if (provider.wsconnected) return (provider.synced ? 'synced' : 'connected');
  return provider.wsconnecting ? 'connecting' : 'unreachable';
}

export function useSyncConnection(provider: WebsocketProvider): SyncConnection {
  const [status, setStatus] = useState(() => readStatus(provider));

  useEffect(() => {
    const update = () => setStatus(readStatus(provider));
    update();
    provider.on('status', update);
    provider.on('sync', update);
    provider.on('connection-close', update);
    provider.on('connection-error', update);
    return () => {
      provider.off('status', update);
      provider.off('sync', update);
      provider.off('connection-close', update);
      provider.off('connection-error', update);
    };
  }, [provider]);

  const setOnline = useCallback(
    (online: boolean) => {
      if (online === provider.shouldConnect) return;
      if (online) {
        provider.connect();
      } else {
        provider.disconnect();
      }
      setStatus(readStatus(provider));
    },
    [provider]
  );

  const toggle = useCallback(() => {
    setOnline(!provider.shouldConnect);
  }, [provider, setOnline]);

  return { status, online: status !== 'offline', setOnline, toggle };
}
