export interface LegendItem {
  label: string;
  color: string;
}

interface LegendProps {
  items: LegendItem[];
  mark?: 'dot' | 'line';
}

export function Legend({ items, mark = 'dot' }: LegendProps) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Series">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          {mark === 'dot' ? (
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
          ) : (
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: item.color }} aria-hidden />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
