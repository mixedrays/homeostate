import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import { devtoolsSource, wsProvider } from "../zustand/store/useTodoStore";
import { TodoInput } from "../zustand/components/TodoInput";
import { FilterControls } from "../zustand/components/FilterControls";
import { TodoList } from "../zustand/components/TodoList";

export default function ZustandTodo() {
  return (
    <TodoDemoLayout
      demo={demos.zustand}
      provider={wsProvider}
      devtools={devtoolsSource}
    >
      <TodoInput />
      <FilterControls />
      <TodoList />
    </TodoDemoLayout>
  );
}
