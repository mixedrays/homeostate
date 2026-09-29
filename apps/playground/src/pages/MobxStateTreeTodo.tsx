import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import {
  devtoolsSource,
  wsProvider,
  ydoc,
} from "../mobx-state-tree/store/TodoStore";
import { TodoInput } from "../mobx-state-tree/components/TodoInput";
import { FilterControls } from "../mobx-state-tree/components/FilterControls";
import { TodoList } from "../mobx-state-tree/components/TodoList";

export default function MobxStateTreeTodo() {
  return (
    <TodoDemoLayout
      demo={demos["mobx-state-tree"]}
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
