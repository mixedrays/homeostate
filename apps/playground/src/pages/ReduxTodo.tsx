import { Provider } from "react-redux";
import { TodoDemoLayout } from "../components/todo/TodoDemoLayout";
import { demos } from "../demos";
import {
  devtoolsSource,
  store,
  wsProvider,
  ydoc,
} from "../redux/store/todoStore";
import { TodoInput } from "../redux/components/TodoInput";
import { FilterControls } from "../redux/components/FilterControls";
import { TodoList } from "../redux/components/TodoList";

export default function ReduxTodo() {
  return (
    <Provider store={store}>
      <TodoDemoLayout
        demo={demos.redux}
        provider={wsProvider}
        doc={ydoc}
        devtools={devtoolsSource}
      >
        <TodoInput />
        <FilterControls />
        <TodoList />
      </TodoDemoLayout>
    </Provider>
  );
}
