import { TodoComposer } from '../../components/todo/TodoComposer';
import { todoStore } from '../store/TodoStore';

export function TodoInput() {
  return <TodoComposer onAdd={todoStore.addTodo} />;
}
