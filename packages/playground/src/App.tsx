import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Home from './pages/Home';

const ZustandTodo = lazy(() => import('./pages/ZustandTodo'));
const MobxTodo = lazy(() => import('./pages/MobxTodo'));
const ReduxTodo = lazy(() => import('./pages/ReduxTodo'));

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400"
    >
      <Loader2 size={24} aria-hidden className="animate-spin" />
      <span className="sr-only">Loading demo</span>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
