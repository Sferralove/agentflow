import type { AgentEvent } from '../types';

interface AgentTreeProps {
  events: AgentEvent[];
  selectedAgent?: string | null;
  onSelect: (agentId: string) => void;
}

export default function AgentTree({ events, selectedAgent, onSelect }: AgentTreeProps) {
  const agents = buildAgentTree(events);

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Agents</label>
      <div className="space-y-1">
        {agents.map((agent) => (
          <AgentNode key={agent.id} agent={agent} selected={selectedAgent} onSelect={onSelect} depth={0} />
        ))}
      </div>
    </div>
  );
}

interface AgentNodeData {
  id: string;
  name: string;
  children: AgentNodeData[];
  status: string;
}

function buildAgentTree(events: AgentEvent[]): AgentNodeData[] {
  const agentMap = new Map<string, AgentNodeData>();

  for (const event of events) {
    if (!agentMap.has(event.agent)) {
      agentMap.set(event.agent, { id: event.agent, name: event.agent, children: [], status: 'idle' });
    }
    if (event.targetAgent && !agentMap.has(event.targetAgent)) {
      agentMap.set(event.targetAgent, { id: event.targetAgent, name: event.targetAgent, children: [], status: 'idle' });
    }
    if (event.targetAgent) {
      const parent = agentMap.get(event.agent)!;
      const child = agentMap.get(event.targetAgent)!;
      if (!parent.children.find((c) => c.id === child.id)) {
        parent.children.push(child);
      }
    }
    const agent = agentMap.get(event.agent)!;
    if (event.type === 'start') agent.status = 'running';
    if (event.type === 'complete') agent.status = 'completed';
    if (event.type === 'error') agent.status = 'error';
  }

  const childIds = new Set<string>();
  for (const agent of agentMap.values()) {
    for (const child of agent.children) childIds.add(child.id);
  }

  return Array.from(agentMap.values()).filter((a) => !childIds.has(a.id));
}

function AgentNode({ agent, selected, onSelect, depth }: {
  agent: AgentNodeData;
  selected?: string | null;
  onSelect: (agentId: string) => void;
  depth: number;
}) {
  return (
    <div>
      <button
        onClick={() => onSelect(agent.id)}
        className={`w-full text-left px-2 py-1 rounded text-sm hover:bg-gray-700 ${selected === agent.id ? 'bg-gray-700' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusDot(agent.status)}`} />
        {agent.name}
      </button>
      {agent.children.map((child) => (
        <AgentNode key={child.id} agent={child} selected={selected} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  );
}

function getStatusDot(status: string): string {
  switch (status) {
    case 'running': return 'bg-green-500';
    case 'completed': return 'bg-blue-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}
