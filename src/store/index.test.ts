import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from './index.js';

describe('PluginStore', () => {
  let tmpDir: string;
  let store: PluginStore;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads events', async () => {
    const event = {
      id: 'test-1',
      sessionId: 'sess-1',
      type: 'start' as const,
      agent: 'test',
      payload: { action: 'test' },
      timestamp: Date.now(),
    };
    await store.addEvent(event);
    const events = store.getEvents('sess-1');
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'test-1');
  });

  it('returns empty array for unknown session', () => {
    const events = store.getEvents('nonexistent');
    assert.deepEqual(events, []);
  });

  it('lists sessions after events are added', async () => {
    await store.addEvent({
      id: 'test-2',
      sessionId: 'sess-list',
      type: 'start' as const,
      agent: 'test',
      payload: {},
      timestamp: Date.now(),
    });
    const sessions = store.getSessions();
    assert.ok(sessions.includes('sess-list'));
  });

  it('handles atomic writes (no .tmp files remain)', async () => {
    const event = {
      id: 'atomic-1',
      sessionId: 'sess-atomic',
      type: 'complete' as const,
      agent: 'test',
      payload: {},
      timestamp: Date.now(),
    };
    await store.addEvent(event);
    const events = store.getEvents('sess-atomic');
    assert.equal(events.length, 1);
    const dataDir = path.join(tmpDir, '.agent-flow', 'data');
    const files = fs.readdirSync(dataDir);
    assert.ok(!files.some(f => f.endsWith('.tmp')));
  });

  it('appends events to existing session file', async () => {
    for (let i = 0; i < 3; i++) {
      await store.addEvent({
        id: `append-${i}`,
        sessionId: 'sess-append',
        type: 'task' as const,
        agent: 'test',
        payload: { n: i },
        timestamp: Date.now(),
      });
    }
    const events = store.getEvents('sess-append');
    assert.equal(events.length, 3);
  });
});
