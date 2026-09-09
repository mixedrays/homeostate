import { StoreProvider } from '../mobx/store/StoreContext';
import { TodoInput } from '../mobx/components/TodoInput';
import { FilterControls } from '../mobx/components/FilterControls';
import { TodoList } from '../mobx/components/TodoList';

export function MobxTodo() {
  return (
    <StoreProvider>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto py-12 px-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-8">MobX Todo App</h1>
          <div className="space-y-10">
            <TodoInput />
            <FilterControls />
            <TodoList />
          </div>
        </div>
      </div>
    </StoreProvider>
  );
}
