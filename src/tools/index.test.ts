import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../store/index.js';
import { createTools } from './index.js';

describe('createTools', () => {
  let tmpDir: string;
  let store: PluginStore;
  let tools: ReturnType<typeof createTools>;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    tools = createTools(store);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('agentflow_sessions returns empty list initially', async () => {
    const result = await tools.agentflow_sessions.execute({});
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed.sessions));
    assert.equal(parsed.count, 0);
  });

  it('agentflow_sessions returns session list after adding events', async () => {
    await store.addEvent({
      id: 's1',
      sessionId: 'sess-list-2',
      type: 'start' as const,
      agent: 'test',
      payload: {},
      timestamp: Date.now(),
    });
    const result = await tools.agentflow_sessions.execute({});
    const parsed = JSON.parse(result);
    assert.ok(parsed.sessions.includes('sess-list-2'));
    assert.ok(parsed.count >= 1);
  });

  it('agentflow_events returns events for a specific session', async () => {
    await store.addEvent({
      id: 'ev-1',
      sessionId: 'q-sess',
      type: 'start' as const,
      agent: 'test',
      payload: {},
      timestamp: Date.now(),
    });
    const result = await tools.agentflow_events.execute({ sessionId: 'q-sess', limit: 10 });
    const events = JSON.parse(result);
    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 1);
    const match = events.find((e: { id: string }) => e.id === 'ev-1');
    assert.ok(match);
  });

  it('agentflow_events returns latest across sessions when no sessionId', async () => {
    const result = await tools.agentflow_events.execute({ limit: 5 });
    const events = JSON.parse(result);
    assert.ok(Array.isArray(events));
    // Events should be sorted newest-first
    for (let i = 0; i < events.length - 1; i++) {
      assert.ok(events[i].timestamp >= events[i + 1].timestamp);
    }
  });

  it('agentflow_stats returns aggregated stats', async () => {
    const result = await tools.agentflow_stats.execute({});
    const stats = JSON.parse(result);
    assert.equal(typeof stats.total, 'number');
    assert.equal(typeof stats.errors, 'number');
    assert.ok(stats.byType);
    assert.ok(stats.byAgent);
    if (stats.total > 0) {
      assert.equal(typeof stats.firstEvent, 'number');
      assert.equal(typeof stats.lastEvent, 'number');
    }
  });
});
