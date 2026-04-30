import { useState, useMemo } from 'react';
import FlowGraph from './FlowGraph';
import EventTimeline from './EventTimeline';
import AgentTree from './AgentTree';
import SessionSelector from './SessionSelector';
import type { AgentEvent, AgentStatus } from '../types';

interface DashboardProps {
  events: AgentEvent[];
  connected?: boolean;
  onNewEvent: (event: AgentEvent) => void;
}

export default function Dashboard({ events, connected, onNewEvent: _onNewEvent }: DashboardProps) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const sessions = [...new Set(events.map((e) => e.sessionId))];
  const filteredEvents = selectedSession
    ? events.filter((e) => e.sessionId === selectedSession)
    : events;

  const stats = useMemo(() => {
    const agentStatus = new Map<string, AgentStatus>();
    for (const e of filteredEvents) {
      if (!agentStatus.has(e.agent)) agentStatus.set(e.agent, 'idle');
      if (e.type === 'start' || e.type === 'dispatch' || e.type === 'task' || e.type === 'message')
        agentStatus.set(e.agent, 'running');
      if (e.type === 'complete') agentStatus.set(e.agent, 'completed');
      if (e.type === 'error') agentStatus.set(e.agent, 'error');
    }
    let running = 0, completed = 0, errors = 0, totalTokens = 0;
    for (const [, status] of agentStatus) {
      if (status === 'running') running++;
      else if (status === 'completed') completed++;
      else if (status === 'error') errors++;
    }
    for (const e of filteredEvents) {
      if (e.payload?.tokens && typeof e.payload.tokens === 'number') totalTokens += e.payload.tokens;
    }
    return { running, completed, errors, totalTokens, totalAgents: agentStatus.size };
  }, [filteredEvents]);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800/80 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <span className="text-emerald-400">⬡</span> Agent Flow
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-xs text-gray-500">{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>

        <div className="p-4 border-b border-gray-700">
          <SessionSelector sessions={sessions} selected={selectedSession} onSelect={setSelectedSession} />
        </div>

        <div className="p-4 border-b border-gray-700">
          <AgentTree events={filteredEvents} selectedAgent={selectedAgent} onSelect={setSelectedAgent} />
        </div>

        {/* Stats Panel */}
        <div className="p-4 mt-auto border-t border-gray-700">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Stats</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800 rounded-lg p-2 text-center border border-gray-700">
              <div className="text-lg font-bold text-emerald-400">{stats.running}</div>
              <div className="text-[10px] text-gray-500 uppercase">Running</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center border border-gray-700">
              <div className="text-lg font-bold text-gray-400">{stats.completed}</div>
              <div className="text-[10px] text-gray-500 uppercase">Done</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center border border-gray-700">
              <div className="text-lg font-bold text-red-400">{stats.errors}</div>
              <div className="text-[10px] text-gray-500 uppercase">Errors</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center border border-gray-700">
              <div className="text-lg font-bold text-blue-400">{stats.totalAgents}</div>
              <div className="text-[10px] text-gray-500 uppercase">Agents</div>
            </div>
          </div>
          {stats.totalTokens > 0 && (
            <div className="mt-2 text-xs text-gray-500 text-center">
              {(stats.totalTokens / 1000).toFixed(1)}k tokens used
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1">
          <FlowGraph events={filteredEvents} selectedAgent={selectedAgent} />
        </div>
        <div className="h-48 border-t border-gray-700 overflow-y-auto">
          <EventTimeline events={filteredEvents} onSelectAgent={setSelectedAgent} />
        </div>
      </div>
    </div>
  );
}
