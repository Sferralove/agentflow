import type { AgentEvent, AgentStatus, EventType } from '../types';

interface AgentTreeProps {
  events: AgentEvent[];
  selectedAgent?: string | null;
  onSelect: (agentId: string) => void;
}

interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  status: AgentStatus;
  eventCount: number;
}

const statusDot: Record<AgentStatus, string> = {
  running:   'bg-emerald-400 shadow-emerald-400/50',
  completed: 'bg-gray-400',
  error:     'bg-red-400 shadow-red-400/50',
  idle:      'bg-blue-400',
};

const statusLabel: Record<AgentStatus, string> = {
  running:   'text-emerald-400',
  completed: 'text-gray-400',
  error:     'text-red-400',
  idle:      'text-gray-500',
};

function deriveStatus(agentId: string, events: AgentEvent[]): AgentStatus {
  const agentEvents = events.filter(e => e.agent === agentId);
  if (agentEvents.length === 0) return 'idle';
  const last = agentEvents[agentEvents.length - 1];
  const map: Record<EventType, AgentStatus> = {
    start: 'running', complete: 'completed', error: 'error',
    dispatch: 'running', task: 'running', message: 'running',
  };
  return map[last.type] || 'idle';
}

function buildTree(events: AgentEvent[]): TreeNode[] {
  const agentMap = new Map<string, TreeNode>();
  const childIds = new Set<string>();

  for (const event of events) {
    if (!agentMap.has(event.agent)) {
      agentMap.set(event.agent, { id: event.agent, name: event.agent, children: [], status: 'idle', eventCount: 0 });
    }
    if (event.targetAgent) {
      if (!agentMap.has(event.targetAgent)) {
        agentMap.set(event.targetAgent, { id: event.targetAgent, name: event.targetAgent, children: [], status: 'idle', eventCount: 0 });
      }
      childIds.add(event.targetAgent);
      const parent = agentMap.get(event.agent)!;
      const child = agentMap.get(event.targetAgent)!;
      if (!parent.children.find(c => c.id === child.id)) {
        parent.children.push(child);
      }
    }
    const agent = agentMap.get(event.agent)!;
    agent.status = deriveStatus(event.agent, events);
    agent.eventCount++;
  }

  return Array.from(agentMap.values()).filter(a => !childIds.has(a.id));
}

function TreeNodeItem({ node, selected, onSelect, depth }: {
  node: TreeNode;
  selected?: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const isSelected = selected === node.id;
  const dot = statusDot[node.status];
  const label = statusLabel[node.status];

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`w-full text-left pl-${depth > 0 ? (depth * 3 + 2).toString() : '2'} pr-2 py-1 rounded text-sm
          flex items-center gap-2 hover:bg-gray-700/50 transition-colors
          ${isSelected ? 'bg-gray-700/80 ring-1 ring-gray-600' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className={`truncate ${isSelected ? 'text-white font-medium' : 'text-gray-300'}`}>
          {node.name}
        </span>
        <span className={`text-[10px] ml-auto shrink-0 ${label}`}>
          {node.status}
        </span>
      </button>
      {node.children.map(child => (
        <TreeNodeItem key={child.id} node={child} selected={selected} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function AgentTree({ events, selectedAgent, onSelect }: AgentTreeProps) {
  const tree = buildTree(events);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Agents</label>
        <span className="text-xs text-gray-500">{tree.length}</span>
      </div>
      <div className="space-y-0.5">
        {tree.map(node => (
          <TreeNodeItem key={node.id} node={node} selected={selectedAgent} onSelect={onSelect} depth={0} />
        ))}
        {tree.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-4">No agents</div>
        )}
      </div>
    </div>
  );
}
