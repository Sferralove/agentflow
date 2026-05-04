import type { AgentInfo } from '../types';

interface AgentCardProps {
  agent: AgentInfo;
}

export default function AgentCard({ agent }: AgentCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{agent.name}</h3>
        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(agent.status)}`}>{agent.status}</span>
      </div>
      <div className="text-sm text-gray-400 space-y-1">
        <div>Type: {agent.type}</div>
        <div>Tasks: {agent.tasksCompleted} completed, {agent.tasksFailed} failed</div>
        {agent.parentId && <div>Parent: {agent.parentId}</div>}
        {agent.children.length > 0 && <div>Children: {agent.children.join(', ')}</div>}
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return 'bg-green-900 text-green-300';
    case 'completed': return 'bg-blue-900 text-blue-300';
    case 'error': return 'bg-red-900 text-red-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
