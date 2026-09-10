import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { TodoListView } from '../../components/todo/TodoListView';
import { useStore } from '../store/storeContext';

export const TodoList = observer(function TodoList() {
  const { todoStore } = useStore();

  return (
    <TodoListView
      todos={toJS(todoStore.filteredTodos)}
      counts={todoStore.counts}
      searchTerm={todoStore.searchTerm}
      filterStatus={todoStore.filterStatus}
      onToggle={todoStore.toggleTodo}
      onDelete={todoStore.deleteTodo}
    />
  );
});
