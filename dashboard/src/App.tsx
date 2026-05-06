// dashboard/src/App.tsx
import { useState, useEffect, useMemo } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useSSE } from './hooks/useSSE';
import type { AgentNode } from './types';
import Header from './components/Header';
import AgentGraph from './components/AgentGraph';
import DetailPanel from './components/DetailPanel';
import { computeCriticalPath } from './utils/criticalPath.js';
import {
  filterTimelineEvents,
  getPathAgentIds,
  type TimelineFilter,
} from './utils/timeline.js';

function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).get('mock') === 'true';
}

function getSessionParam(): string | null {
  return new URLSearchParams(window.location.search).get('session');
}

interface SessionInfo {
  id: string;
  type: 'parent' | 'child';
}

const MOCK_SESSIONS: SessionInfo[] = [
  { id: 'session-builder', type: 'parent' },
  { id: 'session-frontend', type: 'child' },
  { id: 'session-backend', type: 'child' },
  { id: 'session-tester', type: 'child' },
  { id: 'session-devops', type: 'child' },
];

export default function App() {
  const mock = isMockMode();
  const [sessionId, setSessionId] = useState<string | null>(
    getSessionParam() || (mock ? 'session-builder' : null),
  );
  const [sessions, setSessions] = useState<SessionInfo[]>(
    mock ? MOCK_SESSIONS : [],
  );
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const { events, graph, connected, error: streamError } = useSSE(sessionId);

  const isParent =
    sessions.find((session) => session.id === sessionId)?.type === 'parent';
  const connecting = Boolean(sessionId && !connected && events.length === 0);
  const emptySessions = !mock && sessions.length === 0 && !sessionsError;

  // Fetch available sessions (skip in mock mode)
  useEffect(() => {
    if (mock) return;
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d) => {
        const list: SessionInfo[] = d.sessions || [];
        setSessions(list);
        setSessionsError(null);
        if (!getSessionParam() && list.length > 0 && !sessionId) {
          setSessionId(list[0].id);
        }
      })
      .catch(() => setSessionsError('Unable to load sessions from AgentFlow'));
  }, []);

  // Filter visible events: only tool.start, tool.end, session.created
  const visibleEvents = useMemo(() => {
    const keep = new Set(['tool.start', 'tool.end', 'session.created']);
    return events.filter((e) => keep.has(e.type));
  }, [events]);

  const criticalPath = useMemo(
    () => computeCriticalPath(graph.nodes, graph.edges, visibleEvents),
    [graph.nodes, graph.edges, visibleEvents],
  );

  const pathAgentIds = useMemo(
    () => getPathAgentIds(graph.nodes, graph.edges, selectedNode?.id || null),
    [graph.nodes, graph.edges, selectedNode],
  );

  // Filter events: selected graph path, then quick timeline filter.
  const displayEvents = useMemo(() => {
    return filterTimelineEvents(
      visibleEvents,
      timelineFilter,
      selectedNode ? pathAgentIds : undefined,
      criticalPath.nodeIds,
    );
  }, [visibleEvents, timelineFilter, selectedNode, pathAgentIds, criticalPath]);

  const handleSessionChange = (id: string) => {
    setSelectedNode(null);
    setTimelineFilter('all');
    setSessionId(id);
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#070a12] text-gray-100">
      <Header
        sessionId={sessionId || '—'}
        sessions={sessions}
        isParent={isParent}
        onSessionChange={handleSessionChange}
        connected={connected}
      />
      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-gray-800/80 bg-gray-950/70 shadow-2xl shadow-black/30">
          <aside className="w-[26rem] min-h-0 overflow-hidden border-r border-gray-800/80 bg-gray-950/85">
            <DetailPanel
              selectedNode={selectedNode}
              events={displayEvents}
              criticalPathAgentIds={criticalPath.nodeIds}
              timelineFilter={timelineFilter}
              onTimelineFilterChange={setTimelineFilter}
              scopedAgentCount={selectedNode ? pathAgentIds.size : undefined}
              unified={isParent && !selectedNode}
            />
          </aside>
          <main className="relative min-w-0 flex-1 overflow-hidden bg-[#080b14]">
            {(sessionsError || streamError) && (
              <div className="absolute right-4 top-4 z-20 max-w-sm rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200 shadow-xl shadow-black/25 backdrop-blur">
                {sessionsError || streamError}
              </div>
            )}
            {emptySessions && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#080b14]">
                <div className="max-w-md rounded-xl border border-dashed border-gray-800 bg-gray-950/80 px-6 py-5 text-center shadow-2xl shadow-black/25">
                  <div className="text-sm font-semibold text-gray-200">
                    Waiting for sessions
                  </div>
                  <div className="mt-2 text-xs leading-5 text-gray-500">
                    Start an OpenCode session with the AgentFlow plugin enabled.
                    The dashboard will select the first parent session automatically.
                  </div>
                </div>
              </div>
            )}
            {connecting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/85 text-xs text-gray-400 backdrop-blur-sm">
                <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 shadow-xl">
                  Connecting to session stream...
                </div>
              </div>
            )}
            <ReactFlowProvider>
              <AgentGraph
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNode={selectedNode}
                criticalPath={criticalPath}
                onNodeSelect={setSelectedNode}
              />
            </ReactFlowProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
