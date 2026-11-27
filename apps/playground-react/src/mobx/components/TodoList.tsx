import { observer } from "mobx-react-lite";
import { TodoItemRow } from "../../components/todo/TodoItem";
import { TodoListView } from "../../components/todo/TodoListView";
import { useStore } from "../store/storeContext";

/**
 * MobX mutates a todo in place, so props never change; with `observer`, the row subscribes to
 * the fields it reads and re-renders alone.
 */
const ObservedTodoItem = observer(TodoItemRow);

export const TodoList = observer(function TodoList() {
  const { todoStore } = useStore();

  return (
    <TodoListView
      // Not `toJS`: that rebuilt every todo as a fresh plain object on every render, so every
      // row saw a new prop and re-rendered. The observable todos keep their identity.
      todos={todoStore.filteredTodos}
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
