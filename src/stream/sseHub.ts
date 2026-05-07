import type { PatchEnvelope } from '../trace/traceTypes.js'

function formatSsePatch(patch: PatchEnvelope): string {
  return `id: ${patch.sequence}\nevent: ${patch.type}\ndata: ${JSON.stringify(patch)}\n\n`
}

function enqueuePatch(controller: ReadableStreamDefaultController, patch: PatchEnvelope): void {
  try {
    controller.enqueue(formatSsePatch(patch))
  } catch {
    // Ignore broken clients so one stream cannot block patch delivery to others.
  }
}

export function createSseHub() {
  const historyByRunId = new Map<string, PatchEnvelope[]>()
  const clientsByRunId = new Map<string, Set<ReadableStreamDefaultController>>()

  function getPatchesAfter(runId: string, after: number): PatchEnvelope[] {
    return (historyByRunId.get(runId) ?? []).filter((patch) => patch.sequence > after)
  }

  function replay(
    runId: string,
    after: number,
    controller: ReadableStreamDefaultController,
  ): void {
    for (const patch of getPatchesAfter(runId, after)) {
      enqueuePatch(controller, patch)
    }
  }

  return {
    addClient(runId: string, controller: ReadableStreamDefaultController): void {
      const clients = clientsByRunId.get(runId) ?? new Set<ReadableStreamDefaultController>()
      clients.add(controller)
      clientsByRunId.set(runId, clients)
    },

    removeClient(runId: string, controller: ReadableStreamDefaultController): void {
      const clients = clientsByRunId.get(runId)
      if (!clients) {
        return
      }

      clients.delete(controller)
      if (clients.size === 0) {
        clientsByRunId.delete(runId)
      }
    },

    publish(patches: PatchEnvelope[]): void {
      for (const patch of patches) {
        const history = historyByRunId.get(patch.runId) ?? []
        history.push(patch)
        historyByRunId.set(patch.runId, history)

        for (const controller of clientsByRunId.get(patch.runId) ?? []) {
          enqueuePatch(controller, patch)
        }
      }
    },

    replay,
    getPatchesAfter,
  }
}
