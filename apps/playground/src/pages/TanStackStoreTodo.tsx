import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import {
  devtoolsSource,
  wsProvider,
  ydoc,
} from "../tanstack-store/store/todoStore";
import { TodoInput } from "../tanstack-store/components/TodoInput";
import { FilterControls } from "../tanstack-store/components/FilterControls";
import { TodoList } from "../tanstack-store/components/TodoList";

export default function TanStackStoreTodo() {
  return (
    <TodoDemoLayout
      demo={demos["tanstack-store"]}
      provider={wsProvider}
      doc={ydoc}
      devtools={devtoolsSource}
    >
      <TodoInput />
      <FilterControls />
      <TodoList />
    </TodoDemoLayout>
  );
}
