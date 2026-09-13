import { memo, type ReactElement } from 'react';
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { Provider, useSelector } from 'react-redux';
import { createReduxAdapter } from '@homeostate/adapter-redux';
import type { Todo, TodoState } from '@homeostate/benchmark';
import { createCounters } from '../counters.js';
import type { Fixture } from '../types.js';

/**
 * The idiomatic Redux list: one selector per component, `React.memo` on the row, and the row
 * handed the todo object itself. `useSelector` compares by reference, and so does `memo` for
 * a single object prop, so a row re-renders exactly when its own todo is a new object.
 */
export const redux: Fixture = {
  name: 'redux',
  description: 'Redux Toolkit, useSelector per component, React.memo rows keyed by id',

  create: (initial) => {
    const counters = createCounters();

    const slice = createSlice({
      name: 'todos',
      initialState: initial,
      reducers: {
        setState: (_state, action: PayloadAction<TodoState>) => action.payload,
      },
    });

    const store = configureStore({
      reducer: slice.reducer,
      // Both checks walk the whole state on every dispatch, which at 4000 todos would be most
      // of what `applyMs` measures and none of what it is about.
      middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    });

    const Row = memo(function Row({ todo }: { todo: Todo }) {
      counters.row++;
      return <li data-completed={todo.completed}>{todo.title}</li>;
    });

    const List = (): ReactElement => {
      counters.list++;
      const todos = useSelector((state: TodoState) => state.todos);
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
      const searchTerm = useSelector((state: TodoState) => state.searchTerm);
      return <input readOnly value={searchTerm} />;
    };

    const Footer = (): ReactElement => {
      counters.footer++;
      const total = useSelector((state: TodoState) => state.todos.length);
      const filterStatus = useSelector((state: TodoState) => state.filterStatus);
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

    return {
      adapter: createReduxAdapter(store, slice.actions.setState),
      tree: (
        <Provider store={store}>
          <App />
        </Provider>
      ),
      counters,
    };
  },
};
