import { destroy, getSnapshot, types, type Instance } from 'mobx-state-tree';
import { createSyncEngine } from '@homeostate/core';
import { createYjsBackend } from '@homeostate/crdt-yjs';
import { createMobxStateTreeAdapter } from '@homeostate/adapter-mobx-state-tree';
import type { FilterStatus, Todo } from '../../types/todo';
import { countTodos, filterTodos } from '../../lib/todos';
import { SYNC_MAP_NAME, connectSharedDoc, createInitialTodoState } from '../../sync';

const TodoModel = types.model('Todo', {
  id: types.identifier,
  title: types.string,
  completed: types.boolean,
});

const TodoStore = types
  .model('TodoStore', {
    todos: types.array(TodoModel),
    searchTerm: types.string,
    filterStatus: types.enumeration<FilterStatus>('FilterStatus', ['all', 'active', 'completed']),
  })
  .views((self) => ({
    get visibleTodos(): Todo[] {
      return filterTodos(getSnapshot(self).todos, self.searchTerm, self.filterStatus);
    },
    get counts() {
      return countTodos(self.todos);
    },
  }))
  .actions((self) => ({
    addTodo(title: string) {
      self.todos.push({ id: crypto.randomUUID(), title, completed: false });
    },
    toggleTodo(id: string) {
      const todo = self.todos.find((t) => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    },
    deleteTodo(id: string) {
      const todo = self.todos.find((t) => t.id === id);
      if (todo) {
        destroy(todo);
      }
    },
    setSearchTerm(term: string) {
      self.searchTerm = term;
    },
    setFilterStatus(status: FilterStatus) {
      self.filterStatus = status;
    },
  }));

export type TodoStoreInstance = Instance<typeof TodoStore>;

export const todoStore = TodoStore.create(createInitialTodoState());

const { ydoc, wsProvider } = connectSharedDoc();
const adapter = createMobxStateTreeAdapter(todoStore);
const syncEngine = createSyncEngine(createYjsBackend(ydoc, SYNC_MAP_NAME), adapter);

syncEngine.connect();

export { syncEngine, ydoc, wsProvider };
