import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import { StoreProvider } from "../mobx/store/StoreProvider";
import { devtoolsSource, wsProvider, ydoc } from "../mobx/store/TodoStore";
import { TodoInput } from "../mobx/components/TodoInput";
import { FilterControls } from "../mobx/components/FilterControls";
import { TodoList } from "../mobx/components/TodoList";

export default function MobxTodo() {
  return (
    <StoreProvider>
      <TodoDemoLayout
        demo={demos.mobx}
        provider={wsProvider}
        doc={ydoc}
        devtools={devtoolsSource}
      >
        <TodoInput />
        <FilterControls />
        <TodoList />
      </TodoDemoLayout>
    </StoreProvider>
  );
}
