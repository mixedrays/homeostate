import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { StoreProvider } from '../mobx/store/StoreProvider';
import { wsProvider, ydoc } from '../mobx/store/TodoStore';
import { TodoInput } from '../mobx/components/TodoInput';
import { FilterControls } from '../mobx/components/FilterControls';
import { TodoList } from '../mobx/components/TodoList';

export default function MobxTodo() {
  return (
    <StoreProvider>
      <DemoLayout demo={demos.mobx} provider={wsProvider} doc={ydoc}>
        <TodoInput />
        <FilterControls />
        <TodoList />
      </DemoLayout>
    </StoreProvider>
  );
}
