import { Todo } from '../../types/todo';
import { useTodoStore } from '../store/useTodoStore';

interface TodoItemProps {
  todo: Todo;
}

export function TodoItem({ todo }: TodoItemProps) {
  const { toggleTodo, deleteTodo } = useTodoStore((state) => ({
    toggleTodo: state.toggleTodo,
    deleteTodo: state.deleteTodo,
  }));

  return (
    <div className="group flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
      <button
        onClick={() => toggleTodo(todo.id)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          todo.completed
            ? 'bg-green-500 border-green-500'
            : 'border-gray-300 hover:border-green-500'
        }`}
      >
        {todo.completed && <span className="w-4 h-4 text-white">✔</span>}
      </button>

      <span
        className={`flex-1 ${
          todo.completed ? 'text-gray-400 line-through' : 'text-gray-700'
        }`}
      >
        {todo.title}
      </span>

      <button
        onClick={() => deleteTodo(todo.id)}
        className="text-gray-400 hover:text-red-500 group-hover:opacity-100 transition-colors opacity-0"
      >
        <span className="w-5 h-5">🗑️</span>
      </button>
    </div>
  );
}
