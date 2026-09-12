import { useSetAtom } from 'jotai';
import { TodoComposer } from '../../components/todo/TodoComposer';
import { addTodoAtom } from '../store/todoAtoms';

export function TodoInput() {
  const addTodo = useSetAtom(addTodoAtom);

  return <TodoComposer onAdd={addTodo} />;
}
