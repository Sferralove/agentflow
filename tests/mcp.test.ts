import { describe, it, expect, beforeEach } from 'vitest';
import { createMCPTools } from '../src/mcp/tools';
import { JsonStore } from '../src/store/json-store';
import type { AgentEvent } from '../src/types';
import fs from 'fs';
import path from 'path';

const TEST_FILE = path.join(__dirname, 'test-data', 'mcp-events.json');

describe('MCP Tools', () => {
  let store: JsonStore;
  let tools: ReturnType<typeof createMCPTools>;

  beforeEach(() => {
    const dir = path.dirname(TEST_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(TEST_FILE)) {
      fs.rmSync(TEST_FILE);
    }
    store = new JsonStore(TEST_FILE);
    tools = createMCPTools(store);
  });

  it('send_event should add event and return success', async () => {
    const result = await tools.send_event.handler({
      type: 'start',
      agent: 'test-agent',
      sessionId: 'session-1',
      payload: { test: true },
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.eventId).toBeDefined();

    const events = await store.getEvents({ sessionId: 'session-1' });
    expect(events).toHaveLength(1);
  });

  it('query_events should return filtered events', async () => {
    await store.addEvent({ id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 });
    await store.addEvent({ id: 'e2', sessionId: 's1', type: 'error', agent: 'a1', payload: {}, timestamp: 2 });
    await store.addEvent({ id: 'e3', sessionId: 's2', type: 'start', agent: 'a2', payload: {}, timestamp: 3 });

    const result = await tools.query_events.handler({ sessionId: 's1' });
    const events = JSON.parse(result.content[0].text);
    expect(events).toHaveLength(2);
  });

  it('get_session should return session data', async () => {
    await store.addEvent({ id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 });

    const result = await tools.get_session.handler({ sessionId: 's1' });
    const session = JSON.parse(result.content[0].text);
    expect(session.id).toBe('s1');
    expect(session.events).toHaveLength(1);
  });

  it('get_agent_info should return agent metadata', async () => {
    await store.addEvent({ id: 'e1', sessionId: 's1', type: 'start', agent: 'a1', payload: {}, timestamp: 1 });

    const result = await tools.get_agent_info.handler({ agentId: 'a1' });
    const agent = JSON.parse(result.content[0].text);
    expect(agent.id).toBe('a1');
    expect(agent.status).toBe('running');
  });

  it('get_agent_tree should return agent hierarchy', async () => {
    await store.addEvent({ id: 'e1', sessionId: 's1', type: 'start', agent: 'parent', payload: {}, timestamp: 1 });
    await store.addEvent({ id: 'e2', sessionId: 's1', type: 'dispatch', agent: 'parent', targetAgent: 'child', payload: {}, timestamp: 2 });

    const result = await tools.get_agent_tree.handler({ sessionId: 's1' });
    const tree = JSON.parse(result.content[0].text);
    expect(tree).toHaveLength(2);
  });
});
