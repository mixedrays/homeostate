import { Provider } from 'react-redux';
import { store } from '../redux/store/todoStore';
import { TodoInput } from '../redux/components/TodoInput';
import { FilterControls } from '../redux/components/FilterControls';
import { TodoList } from '../redux/components/TodoList';

export function ReduxTodo() {
  return (
    <Provider store={store}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto py-12 px-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-8">Redux Todo App</h1>
          <div className="space-y-10">
            <TodoInput />
            <FilterControls />
            <TodoList />
          </div>
        </div>
      </div>
    </Provider>
  );
}
