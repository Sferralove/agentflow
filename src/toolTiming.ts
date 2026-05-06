export class ToolTimer {
  private readonly starts = new Map<string, number[]>()

  start(sessionId: string, tool: string, callId: string | undefined, now: number): void {
    const key = this.key(sessionId, tool, callId)
    this.starts.set(key, [...(this.starts.get(key) || []), now])
  }

  end(sessionId: string, tool: string, callId: string | undefined, now: number): number | undefined {
    const key = this.key(sessionId, tool, callId)
    const queue = this.starts.get(key)
    const started = queue?.shift()
    if (!queue || queue.length === 0) this.starts.delete(key)
    else this.starts.set(key, queue)

    return started == null ? undefined : now - started
  }

  private key(sessionId: string, tool: string, callId: string | undefined): string {
    return `${sessionId}:${tool}:${callId || 'default'}`
  }
}
