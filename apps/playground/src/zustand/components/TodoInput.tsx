import { TodoComposer } from '../../components/todo/TodoComposer';
import { useTodoStore } from '../store/useTodoStore';

export function TodoInput() {
  const addTodo = useTodoStore((state) => state.addTodo);

  return <TodoComposer onAdd={addTodo} />;
}
