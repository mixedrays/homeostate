import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { wsProvider, ydoc } from '../tanstack-store/store/todoStore';
import { TodoInput } from '../tanstack-store/components/TodoInput';
import { FilterControls } from '../tanstack-store/components/FilterControls';
import { TodoList } from '../tanstack-store/components/TodoList';

export default function TanStackStoreTodo() {
  return (
    <DemoLayout demo={demos['tanstack-store']} provider={wsProvider} doc={ydoc}>
      <TodoInput />
      <FilterControls />
      <TodoList />
    </DemoLayout>
  );
}
