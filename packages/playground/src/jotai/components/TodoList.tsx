import { useAtomValue, useSetAtom } from 'jotai';
import { TodoListView } from '../../components/todo/TodoListView';
import {
  deleteTodoAtom,
  filterStatusAtom,
  searchTermAtom,
  todoCountsAtom,
  toggleTodoAtom,
  visibleTodosAtom,
} from '../store/todoAtoms';

export function TodoList() {
  const todos = useAtomValue(visibleTodosAtom);
  const counts = useAtomValue(todoCountsAtom);
  const searchTerm = useAtomValue(searchTermAtom);
  const filterStatus = useAtomValue(filterStatusAtom);
  const toggleTodo = useSetAtom(toggleTodoAtom);
  const deleteTodo = useSetAtom(deleteTodoAtom);

  return (
    <TodoListView
      todos={todos}
      counts={counts}
      searchTerm={searchTerm}
      filterStatus={filterStatus}
      onToggle={toggleTodo}
      onDelete={deleteTodo}
    />
  );
}
