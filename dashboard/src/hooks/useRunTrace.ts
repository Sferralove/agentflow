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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;
    sseRef.current?.close();
    const source = new EventSource(`/api/stream?run=current&after=${lastSequence.current}`);
    sseRef.current = source;

    source.onopen = () => {
      if (!mountedRef.current) { source.close(); return; }
      setConnected(true);
      setError(null);
    };

    source.onerror = () => {
      if (!mountedRef.current) { source.close(); return; }
      setConnected(false);
      source.close();
      sseRef.current = null;
      reconnectRef.current = setTimeout(connectSSE, 2000);
    };

    source.onmessage = (message) => {
      if (!mountedRef.current) return;
      const patch = JSON.parse(message.data) as PatchEnvelope;
      lastSequence.current = Math.max(lastSequence.current, patch.sequence);
      setSnapshot((current) => {
        if (!current) return current;
        return applyPatch(current, patch);
      });
    };

    source.addEventListener('run.updated', ((message: MessageEvent) => {
      if (!mountedRef.current) return;
      const patch = JSON.parse(message.data) as PatchEnvelope;
      lastSequence.current = Math.max(lastSequence.current, patch.sequence);
      setSnapshot((current) => current ? applyPatch(current, patch) : current);
    }) as EventListener);
  }, []);

  const pollForRun = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      fetch('/api/runs/current')
        .then((response) => response.json())
        .then((data) => {
          if (data && data.run) {
            // Run detected — stop polling and connect SSE
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setSnapshot(data as RunSnapshot);
            lastSequence.current = (data as RunSnapshot).lastSequence || 0;
            setError(null);
            connectSSE();
          }
        })
        .catch(() => {
          setError('Waiting for AgentFlow server...');
        });
    }, 1000);
  }, [connectSSE]);

  useEffect(() => {
    // Try snapshot immediately
    fetch('/api/runs/current')
      .then((response) => response.json())
      .then((data) => {
        if (data && data.run) {
          setSnapshot(data as RunSnapshot);
          lastSequence.current = (data as RunSnapshot).lastSequence || 0;
          connectSSE();
        } else {
          // No run yet — start polling 1s
          pollForRun();
        }
      })
      .catch(() => {
        pollForRun();
      });

    return () => {
      mountedRef.current = false;
      pollRef.current && clearInterval(pollRef.current);
      reconnectRef.current && clearTimeout(reconnectRef.current);
      sseRef.current?.close();
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
