import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { wsProvider } from '../zustand/store/useTodoStore';
import { TodoInput } from '../zustand/components/TodoInput';
import { FilterControls } from '../zustand/components/FilterControls';
import { TodoList } from '../zustand/components/TodoList';

export default function ZustandTodo() {
  return (
    <DemoLayout demo={demos.zustand} provider={wsProvider}>
      <TodoInput />
      <FilterControls />
      <TodoList />
    </DemoLayout>
  );
}
