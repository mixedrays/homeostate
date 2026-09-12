import { TodoComposer } from '../../components/todo/TodoComposer';
import { todoActions } from '../store/todoState';

export function TodoInput() {
  return <TodoComposer onAdd={todoActions.addTodo} />;
}
