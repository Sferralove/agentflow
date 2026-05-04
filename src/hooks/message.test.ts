import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../store/index.js';
import { PluginContainer } from '../plugin-container.js';
import { createMessageHooks } from './message.js';

describe('createMessageHooks', () => {
  let tmpDir: string;
  let store: PluginStore;
  let container: PluginContainer;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    container = new PluginContainer();
  });

  beforeEach(() => {
    container.sessionId = 'msg-test';
    container.loggedMessages.clear();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs assistant messages', async () => {
    const hooks = createMessageHooks(store, container);
    const beforeCount = store.getEvents('msg-test').length;
    await hooks['message.updated']({
      message: { id: 'm1', role: 'assistant', content: 'hello world' },
    });
    const events = store.getEvents('msg-test').slice(beforeCount);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'message');
    assert.equal(events[0].payload.messageId, 'm1');
    assert.equal(events[0].payload.description, 'hello world');
  });

  it('skips non-assistant messages', async () => {
    const hooks = createMessageHooks(store, container);
    const beforeCount = store.getEvents('msg-test').length;
    await hooks['message.updated']({
      message: { id: 'm2', role: 'user', content: 'hi' },
    });
    const afterCount = store.getEvents('msg-test').length;
    assert.equal(afterCount, beforeCount);
  });

  it('deduplicates by message ID', async () => {
    const hooks = createMessageHooks(store, container);
    const beforeCount = store.getEvents('msg-test').length;
    await hooks['message.updated']({
      message: { id: 'm3', role: 'assistant', content: 'first' },
    });
    await hooks['message.updated']({
      message: { id: 'm3', role: 'assistant', content: 'second' },
    });
    const events = store.getEvents('msg-test').slice(beforeCount);
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.contentLength, 5); // length of 'first'
  });

  it('does nothing on message.updated when no session', async () => {
    const hooks = createMessageHooks(store, container);
    container.sessionId = null;
    const beforeCount = store.getEvents('msg-test').length;
    await hooks['message.updated']({
      message: { id: 'm-null', role: 'assistant', content: 'test' },
    });
    const afterCount = store.getEvents('msg-test').length;
    assert.equal(afterCount, beforeCount);
  });

  it('truncates long content to 300 chars', async () => {
    const hooks = createMessageHooks(store, container);
    const long = 'x'.repeat(500);
    await hooks['message.updated']({
      message: { id: 'm-long', role: 'assistant', content: long },
    });
    const events = store.getEvents('msg-test');
    const msg = events.find(e => e.payload.messageId === 'm-long');
    assert.ok(msg, 'Should have logged the long message');
    assert.ok(msg?.payload.description?.endsWith('...'), 'Should end with ellipsis');
    assert.ok((msg?.payload.description?.length ?? 0) <= 304); // 300 + '...'
  });

  it('tracks content length in payload', async () => {
    const hooks = createMessageHooks(store, container);
    await hooks['message.updated']({
      message: { id: 'm-len', role: 'assistant', content: 'exactly 23 chars!' },
    });
    const events = store.getEvents('msg-test');
    const msg = events.find(e => e.payload.messageId === 'm-len');
    assert.ok(msg, 'Should have logged the message');
    assert.equal(msg?.payload.contentLength, 17); // 'exactly 23 chars!' = 17 chars
  });
});
