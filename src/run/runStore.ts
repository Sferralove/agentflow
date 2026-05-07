import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PatchEnvelope, Run, RunSnapshot } from '../trace/traceTypes.js'

export function createRunStore(root: string = '.agentflow') {
  const runsDir = join(root, 'runs')
  const indexesDir = join(root, 'indexes')
  const activeRunPath = join(root, 'active-run.json')

  function ensureBaseDirs() {
    mkdirSync(root, { recursive: true })
    mkdirSync(runsDir, { recursive: true })
    mkdirSync(indexesDir, { recursive: true })
  }

  function runDir(runId: string) {
    return join(runsDir, runId)
  }

  function snapshotPath(runId: string) {
    return join(runDir(runId), 'snapshot.json')
  }

  function runPath(runId: string) {
    return join(runDir(runId), 'run.json')
  }

  function patchesPath(runId: string) {
    return join(runDir(runId), 'patches.jsonl')
  }

  function ensureRunDir(runId: string) {
    ensureBaseDirs()
    mkdirSync(runDir(runId), { recursive: true })
  }

  async function readJson<T>(path: string): Promise<T | null> {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return (await file.json()) as T
  }

  async function writePrettyJson(path: string, value: unknown): Promise<void> {
    await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
  }

  return {
    async writeActiveRun(run: Run): Promise<void> {
      ensureBaseDirs()
      await writePrettyJson(activeRunPath, run)
    },

    async readActiveRun(): Promise<Run | null> {
      ensureBaseDirs()
      return readJson<Run>(activeRunPath)
    },

    async writeSnapshot(snapshot: RunSnapshot): Promise<void> {
      ensureRunDir(snapshot.run.id)
      await writePrettyJson(snapshotPath(snapshot.run.id), snapshot)
      await writePrettyJson(runPath(snapshot.run.id), snapshot.run)
    },

    async readSnapshot(runId: string): Promise<RunSnapshot | null> {
      ensureBaseDirs()
      return readJson<RunSnapshot>(snapshotPath(runId))
    },

    async appendPatches(patches: PatchEnvelope[]): Promise<void> {
      if (patches.length === 0) return

      const byRunId = new Map<string, PatchEnvelope[]>()
      for (const patch of patches) {
        const runPatches = byRunId.get(patch.runId) ?? []
        runPatches.push(patch)
        byRunId.set(patch.runId, runPatches)
      }

      for (const [runId, runPatches] of byRunId) {
        ensureRunDir(runId)
        const path = patchesPath(runId)
        const file = Bun.file(path)
        const existing = (await file.exists()) ? await file.text() : ''
        const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
        const appended = runPatches.map((patch) => JSON.stringify(patch)).join('\n')
        await Bun.write(path, `${existing}${prefix}${appended}\n`)
      }
    },

    async readPatchesAfter(runId: string, sequence: number): Promise<PatchEnvelope[]> {
      ensureBaseDirs()
      const file = Bun.file(patchesPath(runId))
      if (!(await file.exists())) return []

      const text = await file.text()
      return text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as PatchEnvelope)
        .filter((patch) => patch.sequence > sequence)
    },
  }
}
