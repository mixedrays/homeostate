import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { wsProvider, ydoc } from '../valtio/store/todoState';
import { TodoInput } from '../valtio/components/TodoInput';
import { FilterControls } from '../valtio/components/FilterControls';
import { TodoList } from '../valtio/components/TodoList';

export default function ValtioTodo() {
  return (
    <DemoLayout demo={demos.valtio} provider={wsProvider} doc={ydoc}>
      <TodoInput />
      <FilterControls />
      <TodoList />
    </DemoLayout>
  );
}
