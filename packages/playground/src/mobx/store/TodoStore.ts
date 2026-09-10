import { makeAutoObservable } from 'mobx';
import { Todo, FilterStatus } from '../../types/todo';
import * as Y from 'yjs';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createMobxAdapter } from '@homeostate/adapter-mobx';
import { WebsocketProvider } from 'y-websocket';

class TodoStore {
  todos: Todo[] = [{ id: '1', title: 'Sample todo', completed: false }];
  searchTerm: string = '';
  filterStatus: FilterStatus = 'all';

  constructor() {
    makeAutoObservable(this);
  }

  addTodo(title: string) {
    this.todos.push({
      id: crypto.randomUUID(),
      title,
      completed: false,
    });
  }

  toggleTodo(id: string) {
    const todo = this.todos.find((t) => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  }

  deleteTodo(id: string) {
    this.todos = this.todos.filter((t) => t.id !== id);
  }

  setSearchTerm(term: string) {
    this.searchTerm = term;
  }

  setFilterStatus(status: FilterStatus) {
    this.filterStatus = status;
  }

  get filteredTodos() {
    return this.todos
      .filter((todo) =>
        todo.title.toLowerCase().includes(this.searchTerm.toLowerCase())
      )
      .filter((todo) => {
        if (this.filterStatus === 'active') return !todo.completed;
        if (this.filterStatus === 'completed') return todo.completed;
        return true;
      });
  }

  get activeTodosCount() {
    return this.todos.filter((todo) => !todo.completed).length;
  }
}

export const todoStore = new TodoStore();

// Initial state for sync (data only, no functions/computeds)
const initialState = {
  todos: [{ id: '1', title: 'Sample todo', completed: false }] as Todo[],
  searchTerm: '',
  filterStatus: 'all' as FilterStatus,
};

// Setup Yjs sync using the MobX adapter
const ydoc = new Y.Doc();

// Connect to WebSocket provider for P2P sync
// Using a different room name to keep MobX and Zustand stores separate
const wsProvider = new WebsocketProvider(
  'ws://localhost:9999',
  'my-roomname',
  ydoc
);

// Create adapter and sync engine
// Specify which properties should be synced to Yjs
const adapter = createMobxAdapter(
  todoStore,
  ['todos', 'searchTerm', 'filterStatus'],
  initialState
);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, 'shared-ydoc'), adapter);

// Start synchronization
syncEngine.connect();

// Export for external access if needed
export { syncEngine, ydoc, wsProvider };
