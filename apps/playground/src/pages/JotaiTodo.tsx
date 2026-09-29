import { Provider } from "jotai";
import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import { devtoolsSource, store, wsProvider } from "../jotai/store/todoAtoms";
import { TodoInput } from "../jotai/components/TodoInput";
import { FilterControls } from "../jotai/components/FilterControls";
import { TodoList } from "../jotai/components/TodoList";

export default function JotaiTodo() {
  return (
    <Provider store={store}>
      <TodoDemoLayout
        demo={demos.jotai}
        provider={wsProvider}
        devtools={devtoolsSource}
      >
        <TodoInput />
        <FilterControls />
        <TodoList />
      </TodoDemoLayout>
    </Provider>
  );
}
