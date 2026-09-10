import { useEffect, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';

export type ProviderStatus = 'connecting' | 'connected' | 'synced' | 'offline';

function readStatus(provider: WebsocketProvider): ProviderStatus {
  if (provider.wsconnected) return provider.synced ? 'synced' : 'connected';
  return provider.wsconnecting ? 'connecting' : 'offline';
}

export function useProviderStatus(provider: WebsocketProvider): ProviderStatus {
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

  return status;
}
