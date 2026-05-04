import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../store/index.js';
import { PluginContainer } from '../plugin-container.js';
import { createToolHooks } from './tool.js';

describe('createToolHooks', () => {
  let tmpDir: string;
  let store: PluginStore;
  let container: PluginContainer;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    container = new PluginContainer();
  });

  beforeEach(() => {
    container.sessionId = 'tool-test';
    container.inFlight.clear();
    container.loggedMessages.clear();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs task event on tool.execute.before', async () => {
    const hooks = createToolHooks(store, container);
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.before']({ tool: 'bash', args: { command: 'ls' } });
    const newEvents = store.getEvents('tool-test').slice(beforeCount);
    const taskEvents = newEvents.filter(e => e.type === 'task');
    assert.equal(taskEvents.length, 1);
    assert.equal(taskEvents[0].agent, 'shell');
    assert.equal(taskEvents[0].payload.action, 'bash');
  });

  it('maps tools to correct agents', async () => {
    const hooks = createToolHooks(store, container);
    const testCases = [
      { tool: 'task', expected: 'delegator' },
      { tool: 'todowrite', expected: 'delegator' },
      { tool: 'read', expected: 'reader' },
      { tool: 'write', expected: 'writer' },
      { tool: 'edit', expected: 'editor' },
      { tool: 'grep', expected: 'searcher' },
      { tool: 'glob', expected: 'finder' },
      { tool: 'webfetch', expected: 'fetcher' },
      { tool: 'skill', expected: 'skill-loader' },
      { tool: 'unknown', expected: 'opencode' },
    ];
    for (const { tool, expected } of testCases) {
      const beforeCount = store.getEvents('tool-test').length;
      await hooks['tool.execute.before']({ tool, args: {} });
      const events = store.getEvents('tool-test').slice(beforeCount);
      const taskEvent = events.find(e => e.type === 'task');
      assert.equal(taskEvent?.agent, expected, `tool "${tool}" should map to "${expected}"`);
    }
  });

  it('respects args.agent override', async () => {
    const hooks = createToolHooks(store, container);
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.before']({ tool: 'bash', args: { agent: 'custom-agent' } });
    const events = store.getEvents('tool-test').slice(beforeCount);
    const taskEvent = events.find(e => e.type === 'task');
    assert.equal(taskEvent?.agent, 'custom-agent');
  });

  it('creates dispatch event for subagent_type', async () => {
    const hooks = createToolHooks(store, container);
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.before']({
      tool: 'task',
      args: { description: 'test task', subagent_type: 'tester' },
    });
    const events = store.getEvents('tool-test').slice(beforeCount);
    const dispatch = events.find(e => e.type === 'dispatch');
    assert.ok(dispatch);
    assert.equal(dispatch?.targetAgent, 'tester');
    assert.equal(dispatch?.payload.reason, 'test task');
  });

  it('does nothing on tool.execute.before when no session', async () => {
    const hooks = createToolHooks(store, container);
    container.sessionId = null;
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.before']({ tool: 'bash', args: {} });
    const afterCount = store.getEvents('tool-test').length;
    assert.equal(afterCount, beforeCount);
  });

  it('logs error event on tool.execute.after when error present', async () => {
    const hooks = createToolHooks(store, container);
    // Need a before call to set up FIFO entry
    await hooks['tool.execute.before']({ tool: 'read', args: {} });
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.after'](
      { tool: 'read', args: {} },
      { error: 'File not found' }
    );
    const events = store.getEvents('tool-test').slice(beforeCount);
    const err = events.find(e => e.type === 'error');
    assert.ok(err, 'Should have logged an error event');
    assert.equal(err?.payload.description, 'File not found');
    assert.equal(err?.agent, 'reader');
  });

  it('logs complete event on tool.execute.after success', async () => {
    const hooks = createToolHooks(store, container);
    await hooks['tool.execute.before']({ tool: 'write', args: {} });
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.after'](
      { tool: 'write', args: {} },
      { result: 'file written successfully' }
    );
    const events = store.getEvents('tool-test').slice(beforeCount);
    const complete = events.find(e => e.type === 'complete');
    assert.ok(complete, 'Should have logged a complete event');
    assert.equal(complete?.agent, 'writer');
    assert.ok(complete?.payload.duration !== undefined);
  });

  it('truncates result to 200 chars', async () => {
    const hooks = createToolHooks(store, container);
    await hooks['tool.execute.before']({ tool: 'bash', args: {} });
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.after'](
      { tool: 'bash', args: {} },
      { result: 'x'.repeat(500) }
    );
    const events = store.getEvents('tool-test').slice(beforeCount);
    const complete = events.find(e => e.type === 'complete');
    assert.ok(complete, 'Should have logged a complete event');
    assert.ok(complete!.payload.result!.length <= 200);
  });

  it('handles FIFO stack for concurrent same-tool calls', async () => {
    const hooks = createToolHooks(store, container);
    const beforeCount = store.getEvents('tool-test').length;

    // Simulate two concurrent bash calls
    await hooks['tool.execute.before']({ tool: 'bash', args: { cmd: 'first' } });
    await hooks['tool.execute.before']({ tool: 'bash', args: { cmd: 'second' } });

    // Complete first then second (FIFO order)
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { cmd: 'first' } },
      { result: 'output 1' }
    );
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { cmd: 'second' } },
      { result: 'output 2' }
    );

    const events = store.getEvents('tool-test').slice(beforeCount);
    const completes = events.filter(e => e.type === 'complete');
    assert.equal(completes.length, 2, 'Should have 2 complete events');
    // FIFO stack should be cleaned up
    assert.equal(container.inFlight.has('bash'), false);
  });

  it('detects skill loading as message event', async () => {
    const hooks = createToolHooks(store, container);
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.before']({
      tool: 'skill',
      args: { name: 'debugging', description: 'load debug skill' },
    });
    const events = store.getEvents('tool-test').slice(beforeCount);
    const msg = events.find(e => e.type === 'message');
    assert.ok(msg, 'Should have logged a message event for skill load');
    assert.equal(msg?.payload.action, 'skill-loaded');
    assert.equal(msg?.payload.description, 'Loaded skill: debugging');
  });

  it('does not log agent-flow skill as message event', async () => {
    const hooks = createToolHooks(store, container);
    const beforeCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.before']({
      tool: 'skill',
      args: { name: 'agent-flow' },
    });
    const events = store.getEvents('tool-test').slice(beforeCount);
    const msg = events.find(e => e.type === 'message');
    assert.equal(msg, undefined);
  });
});
