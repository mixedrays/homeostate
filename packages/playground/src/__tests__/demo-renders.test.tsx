// @vitest-environment jsdom
import { memo, type ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The gate on every demo's render behaviour: toggling one todo must re-render that todo's row
 * and no other, and the row must actually show the change.
 *
 * Both halves matter and they pull in opposite directions. Memoizing the row is what stops the
 * list re-rendering as a block, but a memoized row only updates when its props change — so a
 * store that mutates a todo in place rather than replacing it goes silently stale unless the
 * row subscribes to the todo itself. That is why the MobX demo hands `TodoListView` an
 * `observer` row while the immutable stores use the memoized default.
 */

/** Every row render, in order, identified by the todo it rendered. */
const rendered: string[] = [];

vi.mock('../sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync')>();
  const Y = await import('yjs');
  // The demos open a websocket at module scope; the tests only need the Yjs document.
  return { ...actual, connectSharedDoc: () => ({ ydoc: new Y.Doc(), wsProvider: null }) };
});

vi.mock('../components/todo/TodoItem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/todo/TodoItem')>();
  const TodoItemRow = (props: import('../components/todo/TodoItem').TodoItemProps) => {
    rendered.push(props.todo.id);
    return actual.TodoItemRow(props);
  };
  return { ...actual, TodoItemRow, TodoItem: memo(TodoItemRow) };
});

interface Demo {
  /**
   * Row renders caused by toggling one of five todos. 1 is the target: the row that changed.
   * Anything higher is the list re-rendering as a block.
   */
  rowRenders: number;
  /** Imports the demo's store and components. */
  setup: () => Promise<{
    tree: ReactNode;
    ids: () => string[];
    add: (title: string) => void;
    toggle: (id: string) => void;
    remove: (id: string) => void;
  }>;
}

const demos: Record<string, Demo> = {
  redux: {
    rowRenders: 1,
    setup: async () => {
      const { Provider } = await import('react-redux');
      const { store, addTodo, deleteTodo, toggleTodo } = await import('../redux/store/todoStore');
      const { TodoList } = await import('../redux/components/TodoList');
      return {
        tree: (
          <Provider store={store}>
            <TodoList />
          </Provider>
        ),
        ids: () => store.getState().todos.map((todo) => todo.id),
        add: (title) => void store.dispatch(addTodo(title)),
        toggle: (id) => void store.dispatch(toggleTodo(id)),
        remove: (id) => void store.dispatch(deleteTodo(id)),
      };
    },
  },

  mobx: {
    rowRenders: 1,
    setup: async () => {
      const { todoStore } = await import('../mobx/store/TodoStore');
      const { TodoList } = await import('../mobx/components/TodoList');
      return {
        tree: <TodoList />,
        ids: () => todoStore.todos.map((todo) => todo.id),
        add: (title) => todoStore.addTodo(title),
        toggle: (id) => todoStore.toggleTodo(id),
        remove: (id) => todoStore.deleteTodo(id),
      };
    },
  },

  'mobx-state-tree': {
    rowRenders: 1,
    setup: async () => {
      const { todoStore } = await import('../mobx-state-tree/store/TodoStore');
      const { TodoList } = await import('../mobx-state-tree/components/TodoList');
      return {
        tree: <TodoList />,
        ids: () => todoStore.todos.map((todo) => todo.id),
        add: (title) => todoStore.addTodo(title),
        toggle: (id) => todoStore.toggleTodo(id),
        remove: (id) => todoStore.deleteTodo(id),
      };
    },
  },

  valtio: {
    rowRenders: 1,
    setup: async () => {
      const { todoActions, todoState } = await import('../valtio/store/todoState');
      const { TodoList } = await import('../valtio/components/TodoList');
      return {
        tree: <TodoList />,
        ids: () => todoState.todos.map((todo) => todo.id),
        add: (title) => todoActions.addTodo(title),
        toggle: (id) => todoActions.toggleTodo(id),
        remove: (id) => todoActions.deleteTodo(id),
      };
    },
  },

  zustand: {
    rowRenders: 1,
    setup: async () => {
      const { useTodoStore } = await import('../zustand/store/useTodoStore');
      const { TodoList } = await import('../zustand/components/TodoList');
      return {
        tree: <TodoList />,
        ids: () => useTodoStore.getState().todos.map((todo) => todo.id),
        add: (title) => useTodoStore.getState().addTodo(title),
        toggle: (id) => useTodoStore.getState().toggleTodo(id),
        remove: (id) => useTodoStore.getState().deleteTodo(id),
      };
    },
  },

  jotai: {
    rowRenders: 1,
    setup: async () => {
      const { Provider } = await import('jotai');
      const atoms = await import('../jotai/store/todoAtoms');
      const { TodoList } = await import('../jotai/components/TodoList');
      return {
        tree: (
          <Provider store={atoms.store}>
            <TodoList />
          </Provider>
        ),
        ids: () => atoms.store.get(atoms.todosAtom).map((todo) => todo.id),
        add: (title) => atoms.store.set(atoms.addTodoAtom, title),
        toggle: (id) => atoms.store.set(atoms.toggleTodoAtom, id),
        remove: (id) => atoms.store.set(atoms.deleteTodoAtom, id),
      };
    },
  },

  'tanstack-store': {
    rowRenders: 1,
    setup: async () => {
      const { todoStore } = await import('../tanstack-store/store/todoStore');
      const { TodoList } = await import('../tanstack-store/components/TodoList');
      return {
        tree: <TodoList />,
        ids: () => todoStore.state.todos.map((todo) => todo.id),
        add: (title) => todoStore.actions.addTodo(title),
        toggle: (id) => todoStore.actions.toggleTodo(id),
        remove: (id) => todoStore.actions.deleteTodo(id),
      };
    },
  },
};

beforeAll(() => {
  // @ts-expect-error React reads this global to decide whether `act` is legal here.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  rendered.length = 0;
});

/** Mounts a demo over five todos and leaves the render log empty and ready to read. */
const mount = async (demo: Demo) => {
  const parts = await demo.setup();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    for (const title of ['first', 'second', 'third', 'fourth']) parts.add(title);
  });
  await act(async () => root.render(parts.tree));

  // One row component per todo, or the rest of the test is measuring the wrong tree.
  expect(rendered).toHaveLength(parts.ids().length);
  rendered.length = 0;

  return {
    ...parts,
    container,
    teardown: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

describe.each(Object.entries(demos))('the %s demo', (_name, demo) => {
  it('re-renders only the rows it has to when one todo is toggled, and shows the change', async () => {
    const { ids, toggle, container, teardown } = await mount(demo);

    const target = ids()[2];

    await act(async () => toggle(target));

    // The row re-rendered, and it is the only one that did.
    expect(rendered).toContain(target);
    expect(rendered).toHaveLength(demo.rowRenders);
    // And it is not stale: the third row now reads as completed.
    expect(container.querySelectorAll('li')[2].querySelector('.line-through')).not.toBeNull();

    await teardown();
  });

  it('drops a deleted todo without re-rendering or reading the survivors', async () => {
    // The case a reactive row can get wrong: MST's `deleteTodo` destroys the node, and a row
    // still subscribed to it would read a node that is no longer in the tree. MST reports that
    // through `console.warn` rather than by throwing, so the console is part of the assertion.
    const { ids, remove, container, teardown } = await mount(demo);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The demo stores are module singletons, so the count carries over between cases.
    const before = ids().length;
    const target = ids()[2];
    await act(async () => remove(target));

    expect(container.querySelectorAll('li')).toHaveLength(before - 1);
    // The survivors kept their identity, so none of them re-rendered.
    expect(rendered).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    warn.mockRestore();
    error.mockRestore();
    await teardown();
  });
});
