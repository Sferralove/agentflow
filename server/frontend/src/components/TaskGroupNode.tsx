import type { NodeProps } from 'reactflow';

interface TaskGroupData {
  label: string;
  color: string;
}

const TASK_COLORS = [
  'rgba(16,185,129,0.06)',   // emerald
  'rgba(59,130,246,0.06)',   // blue
  'rgba(168,85,247,0.06)',   // purple
  'rgba(245,158,11,0.06)',   // amber
  'rgba(236,72,153,0.06)',   // pink
];

export function getTaskColor(index: number): string {
  return TASK_COLORS[index % TASK_COLORS.length];
}

export default function TaskGroupNode({ data }: NodeProps<TaskGroupData>) {
  return (
    <div className="w-full h-full rounded-2xl border border-gray-700/30 flex items-start justify-center pt-2 pointer-events-none">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-2 py-0.5 rounded bg-gray-800/50">
        {data.label}
      </span>
    </div>
  );
}
