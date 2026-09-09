import { TodoInput } from '../zustand/components/TodoInput';
import { FilterControls } from '../zustand/components/FilterControls';
import { TodoList } from '../zustand/components/TodoList';

export function ZustandTodo() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-8">Zustand Todo App</h1>
        <div className="space-y-10">
          <TodoInput />
          <FilterControls />
          <TodoList />
        </div>
      </div>
    </div>
  );
}
