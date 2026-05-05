// test/smoke.test.ts
import { describe, test, expect } from 'bun:test'

test('server module exports startServer and stopServer', async () => {
  const { startServer, stopServer } = await import('../src/server.js')
  expect(typeof startServer).toBe('function')
  expect(typeof stopServer).toBe('function')
})

test('plugin module exports AgentFlowPlugin', async () => {
  const { AgentFlowPlugin } = await import('../src/plugin.js')
  expect(typeof AgentFlowPlugin).toBe('function')
})

test('index re-exports all modules', async () => {
  const mod = await import('../src/index.js')
  expect(typeof mod.AgentFlowPlugin).toBe('function')
  expect(typeof mod.startServer).toBe('function')
  expect(typeof mod.stopServer).toBe('function')
})

test('server starts and responds to health check', async () => {
  const { startServer, stopServer } = await import('../src/server.js')

  // Start on test port
  startServer(3099)

  try {
    const res = await fetch('http://localhost:3099/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.clients).toBe('number')
    expect(typeof body.sessions).toBe('number')
  } finally {
    stopServer()
  }
})

test('server returns 404 with CORS headers', async () => {
  const { startServer, stopServer } = await import('../src/server.js')

  startServer(3098)

  try {
    const res = await fetch('http://localhost:3098/nonexistent')
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  } finally {
    stopServer()
  }
})

test('server CORS on OPTIONS preflight', async () => {
  const { startServer, stopServer } = await import('../src/server.js')

  startServer(3097)

  try {
    const res = await fetch('http://localhost:3097/api/events', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  } finally {
    stopServer()
  }
})
