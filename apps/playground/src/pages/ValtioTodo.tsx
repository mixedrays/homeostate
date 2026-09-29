import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import { devtoolsSource, wsProvider } from "../valtio/store/todoState";
import { TodoInput } from "../valtio/components/TodoInput";
import { FilterControls } from "../valtio/components/FilterControls";
import { TodoList } from "../valtio/components/TodoList";

export default function ValtioTodo() {
  return (
    <TodoDemoLayout
      demo={demos.valtio}
      provider={wsProvider}
      devtools={devtoolsSource}
    >
      <TodoInput />
      <FilterControls />
      <TodoList />
    </TodoDemoLayout>
  );
}
