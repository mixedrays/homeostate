import { observer } from 'mobx-react-lite';
import { types, type Instance } from 'mobx-state-tree';
import { createMobxStateTreeAdapter } from '@homeostate/adapter-mobx-state-tree';
import type { TodoState } from '@homeostate/benchmark';
import { createCounters } from '../counters.js';
import type { Fixture } from '../types.js';

const TodoModel = types.model('Todo', {
  id: types.identifier,
  title: types.string,
  completed: types.boolean,
});

const TodoStore = types
  .model('TodoStore', {
    todos: types.array(TodoModel),
    searchTerm: types.string,
    filterStatus: types.enumeration('FilterStatus', ['all', 'active', 'completed']),
  })
  .views((self) => ({
    /** A view is MST's memoized selector, the counterpart of `createSelector`. */
    get total(): number {
      return self.todos.length;
    },
  }));

/**
 * The idiomatic MobX-State-Tree list: `observer` on every component, including the row, and the
 * row handed the node itself. `applySnapshot` reconciles a node that carries an identifier in
 * place, so the rows a change did not touch keep both their identity and their observables.
 */
export const mobxStateTree: Fixture = {
  name: 'mobx-state-tree',
  description: 'MST model with identifiers, observer() on every component including the row',

  create: (initial) => {
    const counters = createCounters();
    const store = TodoStore.create(initial);

    const Row = observer(function Row({ todo }: { todo: Instance<typeof TodoModel> }) {
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
      adapter: createMobxStateTreeAdapter<TodoState>(store),
      tree: <App />,
      counters,
    };
  },
};
