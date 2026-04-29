import { describe, it, expect } from 'vitest';
import type { AgentEvent, AgentInfo, WSMessage } from '../src/types';

describe('Types', () => {
  it('should allow valid AgentEvent', () => {
    const event: AgentEvent = {
      id: 'test-uuid',
      sessionId: 'session-1',
      type: 'start',
      agent: 'backend-dev',
      payload: { action: 'test' },
      timestamp: Date.now(),
    };
    expect(event.type).toBe('start');
    expect(event.agent).toBe('backend-dev');
  });

  it('should allow valid AgentInfo', () => {
    const info: AgentInfo = {
      id: 'agent-1',
      name: 'backend-dev',
      type: 'main',
      children: [],
      capabilities: ['code', 'test'],
      status: 'running',
      sessionId: 'session-1',
      startedAt: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
    };
    expect(info.status).toBe('running');
  });

  it('should allow valid WSMessage', () => {
    const msg: WSMessage = {
      type: 'event',
      data: {
        id: 'evt-1',
        sessionId: 's-1',
        type: 'dispatch',
        agent: 'parent',
        targetAgent: 'child',
        payload: {},
        timestamp: Date.now(),
      },
    };
    expect(msg.type).toBe('event');
  });
});
