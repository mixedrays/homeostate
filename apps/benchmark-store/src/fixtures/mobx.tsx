import { configure, makeAutoObservable } from "mobx";
import { observer } from "mobx-react-lite";
import { createMobxAdapter } from "@homeostate/store-mobx";
import type { Todo, TodoState } from "@homeostate/benchmark-crdt";
import { createCounters } from "../counters.js";
import type { Fixture } from "../types.js";

// The adapter writes inside `runInAction`, but the fixture seeds its store directly, which
// MobX warns about under the default `enforceActions: 'observed'`.
configure({ enforceActions: "never" });

class TodoStore {
  todos: Todo[];
  searchTerm: string;
  filterStatus: TodoState["filterStatus"];

  constructor(initial: TodoState) {
    this.todos = initial.todos;
    this.searchTerm = initial.searchTerm;
    this.filterStatus = initial.filterStatus;
    makeAutoObservable(this);
  }

  /** `makeAutoObservable` turns a getter into a computed, MobX's memoized selector. */
  get total(): number {
    return this.todos.length;
  }
}

/**
 * The idiomatic MobX list: `observer` on every component, the row reading the todo it was
 * handed, so it re-renders when that todo changes or is replaced. `observer` on the list alone
 * would report one row render for the whole list.
 */
export const mobx: Fixture = {
  name: "mobx",
  description:
    "MobX class store, observer() on every component including the row",

  create: (initial) => {
    const counters = createCounters();
    const store = new TodoStore(initial);

    const Row = observer(function Row({ todo }: { todo: Todo }) {
      counters.row++;
      return <li data-completed={todo.completed}>{todo.title}</li>;
    });

    const List = observer(function List() {
      counters.list++;
      return (
        <ul>
          {store.todos.map((todo) => (
            <Row key={todo.id} todo={todo} />
          ))}
        </ul>
      );
    });

    const SearchBox = observer(function SearchBox() {
      counters.searchBox++;
      return <input readOnly value={store.searchTerm} />;
    });

    const Footer = observer(function Footer() {
      counters.footer++;
      return (
        <footer>
          {store.total} · {store.filterStatus}
        </footer>
      );
    });

    const App = observer(function App() {
      counters.app++;
      return (
        <main>
          <SearchBox />
          <List />
          <Footer />
        </main>
      );
    });

    return {
      adapter: createMobxAdapter<TodoState>(store),
      tree: <App />,
      counters,
    };
  },
};
