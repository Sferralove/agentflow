/**
 * Integration test: verify DashboardServer HTTP + WS + broadcast end-to-end.
 * Starts server on ephemeral port, simulates events, validates REST and WS.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { PluginStore } from './store/index.js';
import { DashboardServer } from './server.js';
import type { AgentEvent, DashboardConfig } from './types.js';

const TEST_CONFIG: DashboardConfig = {
  port: 0,  // ephemeral port
  host: 'localhost',
};

function createEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: 'evt-' + Math.random().toString(36).slice(2, 8),
    sessionId: 'test-session',
    type: 'task',
    agent: 'shell',
    payload: { action: 'bash', description: 'test command' },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('DashboardServer integration', () => {
  let store: PluginStore;
  let server: DashboardServer;
  let baseUrl: string;
  let wsUrl: string;

  before(async () => {
    store = new PluginStore('/tmp/agent-flow-test-' + Date.now());
    server = new DashboardServer(store, TEST_CONFIG);
    server.start();

    // Wait for server to be ready and capture actual port
    await new Promise<void>((resolve) => {
      const check = () => {
        // Get actual port from the internal server
        const addr = (server as any).server?.address();
        if (addr && addr.port) {
          baseUrl = `http://localhost:${addr.port}`;
          wsUrl = `ws://localhost:${addr.port}`;
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  });

  after(() => {
    // Close server
    (server as any).server?.close();
  });

  it('GET /api/sessions returns session list', async () => {
    await store.addEvent(createEvent({ sessionId: 's1' }));
    await store.addEvent(createEvent({ sessionId: 's1' }));
    await store.addEvent(createEvent({ sessionId: 's2' }));

    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(body.sessions.includes('s1'));
    assert.ok(body.sessions.includes('s2'));
  });

  it('GET /api/events/:sessionId returns events', async () => {
    await store.addEvent(createEvent({ id: 'abc', sessionId: 's3', type: 'start', agent: 'opencode' }));

    const res = await fetch(`${baseUrl}/api/events/s3`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(body.events.length >= 1);
    const event = body.events.find((e: AgentEvent) => e.id === 'abc');
    assert.ok(event);
    assert.strictEqual(event.type, 'start');
  });

  it('WebSocket receives sessionList on connect', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout waiting for sessionList'));
      }, 3000);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'sessionList') {
          clearTimeout(timeout);
          assert.ok(Array.isArray(msg.sessions));
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  it('WebSocket subscribe receives broadcast events', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const evt = createEvent({ id: 'broadcast-test', sessionId: 'bs1', type: 'complete', agent: 'reader' });
      let subscribed = false;
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout waiting for broadcast event'));
      }, 3000);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'sessionList' && !subscribed) {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'bs1' }));
          subscribed = true;
          // Give subscription time to register, then broadcast
          setTimeout(() => {
            server.broadcast(evt);
          }, 100);
        }
        if (msg.type === 'event' && msg.event?.id === 'broadcast-test') {
          clearTimeout(timeout);
          assert.strictEqual(msg.event.type, 'complete');
          assert.strictEqual(msg.event.agent, 'reader');
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  it('WebSocket only receives events for subscribed session', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const evt1 = createEvent({ id: 'evt-right', sessionId: 'rs1', type: 'task' });
      const evt2 = createEvent({ id: 'evt-wrong', sessionId: 'rs2', type: 'task' });
      let subscribed = false;
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 3000);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'sessionList' && !subscribed) {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'rs1' }));
          subscribed = true;
          setTimeout(() => {
            server.broadcast(evt2); // wrong session — should NOT arrive
            server.broadcast(evt1); // right session — should arrive
          }, 100);
        }
        if (msg.type === 'event') {
          if (msg.event?.id === 'evt-wrong') {
            clearTimeout(timeout);
            reject(new Error('Received event from wrong session'));
          }
          if (msg.event?.id === 'evt-right') {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        }
      });

      ws.on('error', reject);
    });
  });

  it('REST API rejects non-localhost', async () => {
    // fetch() forbids overriding Host header, use http.request directly
    const url = new URL(baseUrl);
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: '/api/sessions',
        method: 'GET',
        headers: { 'Host': 'evil.com' },
      }, resolve);
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(res.statusCode, 403);
  });
});
