import { memo, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { createStore as createZustandStore } from 'zustand/vanilla';
import { createZustandAdapter } from '@homeostate/store-zustand';
import type { Todo, TodoState } from '@homeostate/benchmark-crdt';
import { createCounters } from '../counters.js';
import type { Fixture } from '../types.js';

/**
 * The idiomatic Zustand list: a selector per component through `useStore`, which compares what
 * it returns by reference, and `React.memo` on the row. Structurally the same bargain as Redux
 * — the store hands out whatever object the engine gave it — so the two should agree, and a
 * disagreement between them is a finding about the adapter rather than about the library.
 */
export const zustand: Fixture = {
  name: 'zustand',
  description: 'Zustand vanilla store, useStore selector per component, React.memo rows keyed by id',

  create: (initial) => {
    const counters = createCounters();
    const store = createZustandStore<TodoState>(() => initial);

    const Row = memo(function Row({ todo }: { todo: Todo }) {
      counters.row++;
      return <li data-completed={todo.completed}>{todo.title}</li>;
    });

    const List = (): ReactElement => {
      counters.list++;
      const todos = useStore(store, (state) => state.todos);
      return (
        <ul>
          {todos.map((todo) => (
            <Row key={todo.id} todo={todo} />
          ))}
        </ul>
      );
    };

    const SearchBox = (): ReactElement => {
      counters.searchBox++;
      const searchTerm = useStore(store, (state) => state.searchTerm);
      return <input readOnly value={searchTerm} />;
    };

    const Footer = (): ReactElement => {
      counters.footer++;
      const total = useStore(store, (state) => state.todos.length);
      const filterStatus = useStore(store, (state) => state.filterStatus);
      return (
        <footer>
          {total} · {filterStatus}
        </footer>
      );
    };

    const App = (): ReactElement => {
      counters.app++;
      return (
        <main>
          <SearchBox />
          <List />
          <Footer />
        </main>
      );
    };

    return { adapter: createZustandAdapter(store), tree: <App />, counters };
  },
};
