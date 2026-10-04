import { destroy, types, type Instance } from "mobx-state-tree";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createMobxStateTreeAdapter } from "@homeostate/store-mobx-state-tree";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import type { FilterStatus, Todo } from "../../types/todo";
import { countTodos, filterTodos } from "../../lib/todos";
import {
  SYNC_MAP_NAME,
  connectSharedDoc,
  createInitialTodoState,
} from "../../sync";

const TodoModel = types.model("Todo", {
  id: types.identifier,
  title: types.string,
  completed: types.boolean,
});

const TodoStore = types
  .model("TodoStore", {
    todos: types.array(TodoModel),
    searchTerm: types.string,
    filterStatus: types.enumeration<FilterStatus>("FilterStatus", [
      "all",
      "active",
      "completed",
    ]),
  })
  .views((self) => ({
    /**
     * The nodes, not `getSnapshot(self).todos`. MST rebuilds every child snapshot object on
     * any change, so snapshots gave the memoized row a new prop each time and re-rendered the
     * whole list; a node keeps its identity for as long as it is in the tree. The row reads
     * the node through `observer` — see this demo's `TodoList`.
     */
    get visibleTodos(): Todo[] {
      return filterTodos(self.todos, self.searchTerm, self.filterStatus);
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
    editTodo(id: string, title: string) {
      const todo = self.todos.find((t) => t.id === id);
      if (todo) {
        todo.title = title;
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

const { ydoc, wsProvider, persistence, network } = connectSharedDoc();
const adapter = createMobxStateTreeAdapter(todoStore);
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME);
const syncEngine = createSyncEngine(backend, adapter);

syncEngine.connect();

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "MobX-State-Tree todos",
  adapter,
  backend,
  engine: syncEngine,
  persistence,
  network,
};

export { devtoolsSource, syncEngine, ydoc, wsProvider };
