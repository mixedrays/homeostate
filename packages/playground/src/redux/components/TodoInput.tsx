import { TodoComposer } from '../../components/todo/TodoComposer';
import { useAppDispatch } from '../store/hooks';
import { addTodo } from '../store/todoStore';

export function TodoInput() {
  const dispatch = useAppDispatch();

  return <TodoComposer onAdd={(title) => dispatch(addTodo(title))} />;
}
