import { expect, test } from 'bun:test'
import { createSseHub } from '../src/stream/sseHub.js'
import type { PatchEnvelope } from '../src/trace/traceTypes.js'

function patch(sequence: number, runId = 'run_1'): PatchEnvelope {
  return {
    id: `patch_${sequence}`,
    runId,
    sequence,
    emittedAt: 100 + sequence,
    type: 'run.updated',
    payload: { status: 'running' },
  }
}

function fakeController() {
  const chunks: string[] = []

  return {
    chunks,
    controller: {
      enqueue(chunk: string) {
        chunks.push(chunk)
      },
    } as ReadableStreamDefaultController,
  }
}

test('stores patches and replays patches after sequence', () => {
  const hub = createSseHub()
  const firstPatch: PatchEnvelope = {
    id: 'patch_1',
    runId: 'run_1',
    sequence: 1,
    emittedAt: 100,
    type: 'run.updated',
    payload: { status: 'running' },
  }

  hub.publish([firstPatch])

  expect(hub.getPatchesAfter('run_1', 0)).toEqual([firstPatch])
  expect(hub.getPatchesAfter('run_1', 1)).toEqual([])
})

test('replay writes formatted SSE chunks to a controller', () => {
  const hub = createSseHub()
  const firstPatch = patch(1)
  const secondPatch = patch(2)
  const { chunks, controller } = fakeController()

  hub.publish([firstPatch, secondPatch])
  hub.replay('run_1', 1, controller)

  expect(chunks).toEqual([
    `id: 2\nevent: run.updated\ndata: ${JSON.stringify(secondPatch)}\n\n`,
  ])
})

test('publish only sends patches to clients subscribed to the matching run', () => {
  const hub = createSseHub()
  const runOne = fakeController()
  const runTwo = fakeController()
  const runOnePatch = patch(1, 'run_1')
  const runTwoPatch = patch(2, 'run_2')

  hub.addClient('run_1', runOne.controller)
  hub.addClient('run_2', runTwo.controller)
  hub.publish([runOnePatch, runTwoPatch])

  expect(runOne.chunks).toEqual([
    `id: 1\nevent: run.updated\ndata: ${JSON.stringify(runOnePatch)}\n\n`,
  ])
  expect(runTwo.chunks).toEqual([
    `id: 2\nevent: run.updated\ndata: ${JSON.stringify(runTwoPatch)}\n\n`,
  ])
})

test('removeClient stops later publishes from enqueueing', () => {
  const hub = createSseHub()
  const { chunks, controller } = fakeController()

  hub.addClient('run_1', controller)
  hub.removeClient('run_1', controller)
  hub.publish([patch(1)])

  expect(chunks).toEqual([])
})

test('publish stores a copy so caller mutations cannot change history', () => {
  const hub = createSseHub()
  const publishedPatch = patch(1)

  hub.publish([publishedPatch])
  const payload = publishedPatch.payload as { status: string }
  payload.status = 'completed'

  expect(hub.getPatchesAfter('run_1', 0)[0]?.payload).toEqual({ status: 'running' })
})

test('getPatchesAfter returns copies so result mutations cannot change history', () => {
  const hub = createSseHub()

  hub.publish([patch(1)])
  const returnedPatch = hub.getPatchesAfter('run_1', 0)[0]
  if (!returnedPatch) {
    throw new Error('expected stored patch')
  }
  const payload = returnedPatch.payload as { status: string }
  payload.status = 'completed'

  expect(hub.getPatchesAfter('run_1', 0)[0]?.payload).toEqual({ status: 'running' })
})
