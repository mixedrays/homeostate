import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Homeostate Playground</h1>
        <div className="space-y-4">
          <Link
            to="/zustand"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-blue-700">Zustand Todo App</h2>
            <p className="text-gray-500 mt-2">Todo application with Zustand state management and YJS sync</p>
          </Link>
          <Link
            to="/mobx"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-purple-700">MobX Todo App</h2>
            <p className="text-gray-500 mt-2">Todo application with MobX state management</p>
          </Link>
          <Link
            to="/redux"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-green-700">Redux Todo App</h2>
            <p className="text-gray-500 mt-2">Todo application with Redux Toolkit state management</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
