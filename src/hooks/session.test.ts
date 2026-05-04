import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../store/index.js';
import { PluginContainer } from '../plugin-container.js';
import { createSessionHook } from './session.js';

describe('createSessionHook', () => {
  let tmpDir: string;
  let store: PluginStore;
  let container: PluginContainer;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    container = new PluginContainer();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs session.created event and sets sessionId', async () => {
    const hooks = createSessionHook(store, container);
    await hooks['session.created']({ session: { id: 'abc', title: 'test-session' } });
    assert.equal(container.sessionId, 'abc');
    const events = store.getEvents('abc');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'start');
    assert.equal(events[0].payload.action, 'test-session');
  });

  it('generates sessionId if none provided', async () => {
    const hooks = createSessionHook(store, container);
    await hooks['session.created']({});
    assert.ok(container.sessionId?.startsWith('session-'));
  });

  it('logs session.idle event and clears sessionId', async () => {
    const hooks = createSessionHook(store, container);
    container.sessionId = 'idle-test';
    await hooks['session.idle']();
    const events = store.getEvents('idle-test');
    const complete = events.find(e => e.type === 'complete');
    assert.ok(complete);
    assert.equal(complete?.payload.action, 'session-complete');
    assert.equal(container.sessionId, null);
  });

  it('does nothing on session.idle when no session', async () => {
    const hooks = createSessionHook(store, container);
    container.sessionId = null;
    // Should not throw
    await hooks['session.idle']();
  });

  it('logs session.error event', async () => {
    const hooks = createSessionHook(store, container);
    container.sessionId = 'err-test';
    await hooks['session.error']({ error: { message: 'something broke' } });
    const events = store.getEvents('err-test');
    const err = events.find(e => e.type === 'error');
    assert.ok(err);
    assert.equal(err?.payload.description, 'something broke');
  });

  it('handles session.error with no message', async () => {
    const hooks = createSessionHook(store, container);
    container.sessionId = 'err-test-2';
    await hooks['session.error']({});
    const events = store.getEvents('err-test-2');
    const err = events.find(e => e.type === 'error');
    assert.ok(err);
    assert.equal(err?.payload.description, 'Session error');
  });
});
