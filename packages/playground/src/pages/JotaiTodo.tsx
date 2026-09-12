import { Provider } from 'jotai';
import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { store, wsProvider, ydoc } from '../jotai/store/todoAtoms';
import { TodoInput } from '../jotai/components/TodoInput';
import { FilterControls } from '../jotai/components/FilterControls';
import { TodoList } from '../jotai/components/TodoList';

export default function JotaiTodo() {
  return (
    <Provider store={store}>
      <DemoLayout demo={demos.jotai} provider={wsProvider} doc={ydoc}>
        <TodoInput />
        <FilterControls />
        <TodoList />
      </DemoLayout>
    </Provider>
  );
}
