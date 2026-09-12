import { observer } from 'mobx-react-lite';
import { TodoListView } from '../../components/todo/TodoListView';
import { todoStore } from '../store/TodoStore';

export const TodoList = observer(function TodoList() {
  return (
    <TodoListView
      todos={todoStore.visibleTodos}
      counts={todoStore.counts}
      searchTerm={todoStore.searchTerm}
      filterStatus={todoStore.filterStatus}
      onToggle={todoStore.toggleTodo}
      onDelete={todoStore.deleteTodo}
    />
  );
});
