import { Calendar, Cpu, FileJson, Hash, Layers, Timer, type LucideIcon } from 'lucide-react';
import { formatDate, type Run } from '../lib/runs';

interface Chip {
  icon: LucideIcon;
  text: string;
  title?: string;
}

interface MetaStripProps {
  run: Run;
}

export function MetaStrip({ run }: MetaStripProps) {
  const { meta } = run.report;
  const chips: Chip[] = [
    { icon: Calendar, text: formatDate(meta.date) },
    { icon: Hash, text: meta.commit ?? 'unknown commit', title: 'git commit the run was made at' },
    { icon: Cpu, text: `node ${meta.node}` },
    ...Object.entries(meta.versions).map(([name, version]) => ({ icon: Layers, text: `${name} ${version}` })),
    {
      icon: Timer,
      text: `${meta.options.time} ms/task · ≥${meta.options.minSamples} samples · ${meta.options.operations} ops/pass`,
      title: 'tinybench time per task, minimum samples, operations per footprint pass',
    },
    { icon: FileJson, text: run.name, title: run.source === 'results' ? 'from packages/benchmark/results' : 'opened from a file' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
      {chips.map((chip) => (
        <span key={chip.text} className="inline-flex items-center gap-1.5" title={chip.title}>
          <chip.icon size={14} aria-hidden className="text-slate-400" />
          {chip.text}
        </span>
      ))}
      {meta.dirty && (
        <span
          className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
          title="The working tree had uncommitted changes when this run was made"
        >
          dirty tree
        </span>
      )}
    </div>
  );
}
