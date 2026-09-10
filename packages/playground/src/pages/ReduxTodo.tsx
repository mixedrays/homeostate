import { Provider } from 'react-redux';
import { DemoLayout } from '../components/DemoLayout';
import { demos } from '../demos';
import { store, wsProvider } from '../redux/store/todoStore';
import { TodoInput } from '../redux/components/TodoInput';
import { FilterControls } from '../redux/components/FilterControls';
import { TodoList } from '../redux/components/TodoList';

export default function ReduxTodo() {
  return (
    <Provider store={store}>
      <DemoLayout demo={demos.redux} provider={wsProvider}>
        <TodoInput />
        <FilterControls />
        <TodoList />
      </DemoLayout>
    </Provider>
  );
}
