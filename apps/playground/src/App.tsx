import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { apps, demos } from "./demos";
import Home from "./pages/Home";

const TodoStores = lazy(() => import("./pages/TodoStores"));
const ZustandTodo = lazy(() => import("./pages/ZustandTodo"));
const MobxTodo = lazy(() => import("./pages/MobxTodo"));
const ReduxTodo = lazy(() => import("./pages/ReduxTodo"));
const JotaiTodo = lazy(() => import("./pages/JotaiTodo"));
const ValtioTodo = lazy(() => import("./pages/ValtioTodo"));
const TanStackStoreTodo = lazy(() => import("./pages/TanStackStoreTodo"));
const MobxStateTreeTodo = lazy(() => import("./pages/MobxStateTreeTodo"));
const EditorDemo = lazy(() => import("./pages/EditorDemo"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <Spinner aria-label="Loading demo" className="size-6" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path={apps.todo.path} element={<TodoStores />} />
          <Route path={demos.zustand.path} element={<ZustandTodo />} />
          <Route path={demos.mobx.path} element={<MobxTodo />} />
          <Route path={demos.redux.path} element={<ReduxTodo />} />
          <Route path={demos.jotai.path} element={<JotaiTodo />} />
          <Route path={demos.valtio.path} element={<ValtioTodo />} />
          <Route
            path={demos["tanstack-store"].path}
            element={<TanStackStoreTodo />}
          />
          <Route
            path={demos["mobx-state-tree"].path}
            element={<MobxStateTreeTodo />}
          />
          <Route path={apps.editor.path} element={<EditorDemo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
