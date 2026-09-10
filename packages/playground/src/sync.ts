import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { TodoState } from './types/todo';

const envServerUrl: string | undefined = import.meta.env.VITE_SYNC_SERVER_URL;

export const SYNC_SERVER_URL = envServerUrl ?? 'ws://localhost:9999';
export const SYNC_ROOM = 'my-roomname';
export const SYNC_MAP_NAME = 'shared-ydoc';

export const createInitialTodoState = (): TodoState => ({
  todos: [{ id: '1', title: 'Open a second tab and toggle me', completed: false }],
  searchTerm: '',
  filterStatus: 'all',
});

export function connectSharedDoc() {
  const ydoc = new Y.Doc();
  const wsProvider = new WebsocketProvider(SYNC_SERVER_URL, SYNC_ROOM, ydoc);
  return { ydoc, wsProvider };
}
