import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { ZustandTodo } from './pages/ZustandTodo';
import { MobxTodo } from './pages/MobxTodo';
import { ReduxTodo } from './pages/ReduxTodo';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/zustand" element={<ZustandTodo />} />
        <Route path="/mobx" element={<MobxTodo />} />
        <Route path="/redux" element={<ReduxTodo />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
