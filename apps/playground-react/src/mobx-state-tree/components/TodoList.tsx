import { observer } from "mobx-react-lite";
import { TodoItemRow } from "../../components/todo/TodoItem";
import { TodoListView } from "../../components/todo/TodoListView";
import { todoStore } from "../store/TodoStore";

/**
 * MST mutates a todo node in place, so props never change; with `observer`, the row subscribes
 * to the fields it reads and re-renders alone.
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
