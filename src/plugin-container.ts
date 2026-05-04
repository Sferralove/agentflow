export class PluginContainer {
  sessionId: string | null = null;
  sessionStartedAt: number = 0;
  inFlight = new Map<string, Array<{ agent: string; startedAt: number }>>();
  loggedMessages = new Set<string>();
}
