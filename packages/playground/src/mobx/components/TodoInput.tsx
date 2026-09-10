import { TodoComposer } from '../../components/todo/TodoComposer';
import { useStore } from '../store/storeContext';

export function TodoInput() {
  const { todoStore } = useStore();

  return <TodoComposer onAdd={todoStore.addTodo} />;
}
