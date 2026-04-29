import { useState } from 'react';
import FlowGraph from './FlowGraph';
import EventTimeline from './EventTimeline';
import AgentTree from './AgentTree';
import SessionSelector from './SessionSelector';
import type { AgentEvent } from '../types';

interface DashboardProps {
  events: AgentEvent[];
  onNewEvent: (event: AgentEvent) => void;
}

export default function Dashboard({ events, onNewEvent: _onNewEvent }: DashboardProps) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const sessions = [...new Set(events.map((e) => e.sessionId))];
  const filteredEvents = selectedSession
    ? events.filter((e) => e.sessionId === selectedSession)
    : events;

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <div className="w-64 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Agent Flow</h1>
        <SessionSelector sessions={sessions} selected={selectedSession} onSelect={setSelectedSession} />
        <AgentTree events={filteredEvents} selectedAgent={selectedAgent} onSelect={setSelectedAgent} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex-1 border-b border-gray-700">
          <FlowGraph events={filteredEvents} selectedAgent={selectedAgent} />
        </div>
        <div className="h-64 overflow-y-auto">
          <EventTimeline events={filteredEvents} />
        </div>
      </div>
    </div>
  );
}
