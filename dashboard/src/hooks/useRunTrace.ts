import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentEdge,
  AgentNode,
  Run,
  RunSnapshot,
  TimelineItem,
  TraceNode,
  PatchEnvelope,
} from '../types';

const EMPTY_GRAPH = { nodes: [] as AgentNode[], edges: [] as AgentEdge[] };

function applyPatch(snapshot: RunSnapshot, patch: PatchEnvelope): RunSnapshot {
  if (patch.type === 'run.updated') {
    return { ...snapshot, run: patch.payload as Run, lastSequence: patch.sequence };
  }
  if (patch.type === 'trace.node.upserted' || patch.type === 'trace.node.completed') {
    const node = patch.payload as TraceNode;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      traceNodes: [
        ...snapshot.traceNodes.filter((item) => item.id !== node.id),
        node,
      ],
    };
  }
  if (patch.type === 'timeline.item.upserted') {
    const item = patch.payload as TimelineItem;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      timelineItems: [
        ...snapshot.timelineItems.filter((existing) => existing.id !== item.id),
        item,
      ].sort((a, b) => a.timestamp - b.timestamp),
    };
  }
  if (patch.type === 'graph.node.upserted') {
    const node = patch.payload as AgentNode;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      graph: {
        ...snapshot.graph,
        nodes: [...snapshot.graph.nodes.filter((item) => item.id !== node.id), node],
      },
    };
  }
  if (patch.type === 'graph.edge.upserted') {
    const edge = patch.payload as AgentEdge;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      graph: {
        ...snapshot.graph,
        edges: [...snapshot.graph.edges.filter((item) => item.id !== edge.id), edge],
      },
    };
  }
  return { ...snapshot, lastSequence: Math.max(snapshot.lastSequence, patch.sequence) };
}

export function useRunTrace() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSequence = useRef(0);

  const loadSnapshot = useCallback(() => {
    fetch('/api/runs/current')
      .then((response) => response.json())
      .then((data) => {
        if (!data || !data.run) {
          setSnapshot(null);
          return;
        }
        setSnapshot(data as RunSnapshot);
        lastSequence.current = (data as RunSnapshot).lastSequence || 0;
      })
      .catch(() => setError('Unable to load current run'));
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const source = new EventSource(`/api/stream?run=current&after=${lastSequence.current}`);
    source.onopen = () => {
      setConnected(true);
      setError(null);
    };
    source.onerror = () => {
      setConnected(false);
      setError('Trace stream disconnected');
    };
    source.onmessage = (message) => {
      const patch = JSON.parse(message.data) as PatchEnvelope;
      lastSequence.current = Math.max(lastSequence.current, patch.sequence);
      setSnapshot((current) => {
        if (!current) return current;
        return applyPatch(current, patch);
      });
    };
    source.addEventListener('run.updated', ((message: MessageEvent) => {
      const patch = JSON.parse(message.data) as PatchEnvelope;
      lastSequence.current = Math.max(lastSequence.current, patch.sequence);
      setSnapshot((current) => current ? applyPatch(current, patch) : current);
    }) as EventListener);
    return () => {
      source.close();
      setConnected(false);
    };
  }, []);

  return {
    snapshot,
    connected,
    error,
    graph: snapshot?.graph || EMPTY_GRAPH,
    traceNodes: snapshot?.traceNodes || [],
    timelineItems: snapshot?.timelineItems || [],
    run: snapshot?.run || null,
  };
}
