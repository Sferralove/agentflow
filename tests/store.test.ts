import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonStore } from '../src/store/json-store';
import type { AgentEvent } from '../src/types';
import fs from 'fs';
import path from 'path';

const TEST_DIR = path.join(__dirname, 'test-data');
const TEST_FILE = path.join(TEST_DIR, 'events.json');

describe('JsonStore', () => {
  let store: JsonStore;

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    store = new JsonStore(TEST_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.rmSync(TEST_FILE);
    }
  });

  it('should add and retrieve events', async () => {
    const event: AgentEvent = {
      id: 'evt-1',
      sessionId: 'session-1',
      type: 'start',
      agent: 'backend-dev',
      payload: {},
      timestamp: Date.now(),
    };

    await store.addEvent(event);
    const events = await store.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt-1');
  });

  it('should filter events by type', async () => {
    const events: AgentEvent[] = [
      { id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 },
      { id: 'e2', sessionId: 's1', type: 'complete', agent: 'a1', payload: {}, timestamp: 2 },
      { id: 'e3', sessionId: 's1', type: 'error', agent: 'a1', payload: {}, timestamp: 3 },
    ];

    for (const e of events) {
      await store.addEvent(e);
    }

    const errors = await store.getEvents({ type: 'error' });
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('e3');
  });

  it('should filter events by sessionId', async () => {
    const events: AgentEvent[] = [
      { id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 },
      { id: 'e2', sessionId: 's2', type: 'start', agent: 'a2', payload: {}, timestamp: 2 },
    ];

    for (const e of events) {
      await store.addEvent(e);
    }

    const s1Events = await store.getEvents({ sessionId: 's1' });
    expect(s1Events).toHaveLength(1);
    expect(s1Events[0].sessionId).toBe('s1');
  });

  it('should return session data', async () => {
    const events: AgentEvent[] = [
      { id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 },
      { id: 'e2', sessionId: 's1', type: 'dispatch', agent: 'a1', targetAgent: 'a2', payload: {}, timestamp: 2 },
    ];

    for (const e of events) {
      await store.addEvent(e);
    }

    const session = await store.getSession('s1');
    expect(session).not.toBeNull();
    expect(session!.events).toHaveLength(2);
  });

  it('should return null for non-existent session', async () => {
    const session = await store.getSession('nonexistent');
    expect(session).toBeNull();
  });

  it('should persist and recover from file', async () => {
    const event: AgentEvent = {
      id: 'evt-persist',
      sessionId: 's1',
      type: 'start',
      agent: 'a1',
      payload: {},
      timestamp: Date.now(),
    };

    await store.addEvent(event);
    const store2 = new JsonStore(TEST_FILE);
    const events = await store2.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt-persist');
  });

  it('should return all session IDs', async () => {
    const events: AgentEvent[] = [
      { id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 },
      { id: 'e2', sessionId: 's2', type: 'start', agent: 'a2', payload: {}, timestamp: 2 },
    ];

    for (const e of events) {
      await store.addEvent(e);
    }

    const sessions = await store.getAllSessions();
    expect(sessions).toContain('s1');
    expect(sessions).toContain('s2');
    expect(sessions).toHaveLength(2);
  });
});
