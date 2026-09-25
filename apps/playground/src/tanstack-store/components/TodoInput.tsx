import { TodoComposer } from '../../components/todo/TodoComposer';
import { todoStore } from '../store/todoStore';

export function TodoInput() {
  return <TodoComposer onAdd={todoStore.actions.addTodo} />;
}
