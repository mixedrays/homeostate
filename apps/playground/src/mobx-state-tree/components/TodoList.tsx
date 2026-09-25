import { observer } from 'mobx-react-lite';
import { TodoItemRow } from '../../components/todo/TodoItem';
import { TodoListView } from '../../components/todo/TodoListView';
import { todoStore } from '../store/TodoStore';

/**
 * MST mutates a todo node in place, so the row can never learn about a toggle from its props —
 * the node it was handed is the same one. `observer` closes that gap: the row subscribes to
 * the fields it reads and re-renders itself, and nothing else in the list does.
 */
const ObservedTodoItem = observer(TodoItemRow);

export const TodoList = observer(function TodoList() {
  return (
    <TodoListView
      todos={todoStore.visibleTodos}
      counts={todoStore.counts}
      searchTerm={todoStore.searchTerm}
      filterStatus={todoStore.filterStatus}
      onToggle={todoStore.toggleTodo}
      onEdit={todoStore.editTodo}
      onDelete={todoStore.deleteTodo}
      itemComponent={ObservedTodoItem}
    />
  );
});
