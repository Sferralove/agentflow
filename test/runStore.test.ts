import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { createRunStore } from '../src/run/runStore.js'
import { emptyRunSnapshot } from '../src/trace/traceTypes.js'

const root = '/tmp/agentflow-run-store-test'

function clean() {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
}

test('writes and reads active run snapshot and patches', async () => {
  clean()
  const store = createRunStore(root)
  const snapshot = emptyRunSnapshot({
    id: 'run_1',
    title: 'Run 1',
    rootSessionId: 'session_1',
    status: 'running',
    startedAt: 100,
    lastSeenAt: 100,
  })

  await store.writeActiveRun(snapshot.run)
  await store.writeSnapshot(snapshot)
  await store.appendPatches([
    {
      id: 'patch_1',
      runId: 'run_1',
      sequence: 1,
      emittedAt: 101,
      type: 'run.updated',
      payload: snapshot.run,
    },
  ])

  expect(await store.readActiveRun()).toEqual(snapshot.run)
  expect(existsSync(`${root}/active-run.json`)).toBe(true)
  expect(existsSync(`${root}/indexes/active-run.json`)).toBe(false)
  expect((await store.readSnapshot('run_1'))?.run.id).toBe('run_1')
  expect(existsSync(`${root}/runs/run_1/snapshot.json`)).toBe(true)
  expect(existsSync(`${root}/runs/run_1/run.json`)).toBe(true)
  expect(JSON.parse(readFileSync(`${root}/runs/run_1/run.json`, 'utf8')).id).toBe('run_1')
  expect(await store.readPatchesAfter('run_1', 0)).toHaveLength(1)
  expect(await store.readPatchesAfter('run_1', 1)).toHaveLength(0)
})

test('appendPatches is a no-op for empty patch lists', async () => {
  clean()
  const store = createRunStore(root)

  await store.appendPatches([])

  expect(await store.readPatchesAfter('run_missing', 0)).toEqual([])
})

test('returns null and empty lists for missing run data', async () => {
  clean()
  const store = createRunStore(root)

  expect(await store.readActiveRun()).toBeNull()
  expect(await store.readSnapshot('run_missing')).toBeNull()
  expect(await store.readPatchesAfter('run_missing', 0)).toEqual([])
})
