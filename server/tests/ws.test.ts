import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentFlowWSServer } from '../src/ws/server';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const TEST_FILE = path.join(__dirname, 'test-data', 'ws-events.json');

describe('AgentFlowWSServer', () => {
  let wsServer: AgentFlowWSServer;
  const PORT = 9999;

  beforeEach(async () => {
    const dir = path.dirname(TEST_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(TEST_FILE)) {
      fs.rmSync(TEST_FILE);
    }
    wsServer = new AgentFlowWSServer(PORT, 1000);
    await wsServer.start();
  });

  afterEach(async () => {
    await wsServer.stop();
  });

  it('should accept client connections', async () => {
    const client = new WebSocket(`ws://localhost:${PORT}`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => {
        client.close();
        resolve();
      });
      client.on('error', reject);
    });
  });

  it('should broadcast events to connected clients', async () => {
    const client = new WebSocket(`ws://localhost:${PORT}`);
    const messages: string[] = [];

    await new Promise<void>((resolve) => {
      client.on('message', (data) => {
        messages.push(data.toString());
        if (messages.length === 1) {
          client.close();
          resolve();
        }
      });

      client.on('open', () => {
        wsServer.broadcast({
          id: 'evt-1',
          sessionId: 's1',
          type: 'start',
          agent: 'a1',
          payload: {},
          timestamp: Date.now(),
        });
      });
    });

    expect(messages).toHaveLength(1);
    const msg = JSON.parse(messages[0]);
    expect(msg.type).toBe('event');
    expect(msg.data.id).toBe('evt-1');
  });

  it('should send heartbeat', async () => {
    const client = new WebSocket(`ws://localhost:${PORT}`);
    const messages: string[] = [];

    await new Promise<void>((resolve) => {
      client.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        messages.push(msg.type);
        if (msg.type === 'heartbeat') {
          client.close();
          resolve();
        }
      });
    });

    expect(messages).toContain('heartbeat');
  });
});
