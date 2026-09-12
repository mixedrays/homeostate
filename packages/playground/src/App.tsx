import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import Home from './pages/Home';

const ZustandTodo = lazy(() => import('./pages/ZustandTodo'));
const MobxTodo = lazy(() => import('./pages/MobxTodo'));
const ReduxTodo = lazy(() => import('./pages/ReduxTodo'));
const JotaiTodo = lazy(() => import('./pages/JotaiTodo'));
const ValtioTodo = lazy(() => import('./pages/ValtioTodo'));
const TanStackStoreTodo = lazy(() => import('./pages/TanStackStoreTodo'));
const MobxStateTreeTodo = lazy(() => import('./pages/MobxStateTreeTodo'));

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
          <Route path="/zustand" element={<ZustandTodo />} />
          <Route path="/mobx" element={<MobxTodo />} />
          <Route path="/redux" element={<ReduxTodo />} />
          <Route path="/jotai" element={<JotaiTodo />} />
          <Route path="/valtio" element={<ValtioTodo />} />
          <Route path="/tanstack-store" element={<TanStackStoreTodo />} />
          <Route path="/mobx-state-tree" element={<MobxStateTreeTodo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
