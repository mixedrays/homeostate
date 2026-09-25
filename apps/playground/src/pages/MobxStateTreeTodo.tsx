import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { wsProvider, ydoc } from '../mobx-state-tree/store/TodoStore';
import { TodoInput } from '../mobx-state-tree/components/TodoInput';
import { FilterControls } from '../mobx-state-tree/components/FilterControls';
import { TodoList } from '../mobx-state-tree/components/TodoList';

export default function MobxStateTreeTodo() {
  return (
    <DemoLayout demo={demos['mobx-state-tree']} provider={wsProvider} doc={ydoc}>
      <TodoInput />
      <FilterControls />
      <TodoList />
    </DemoLayout>
  );
}
