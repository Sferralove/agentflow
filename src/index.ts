// src/index.ts — Public package exports
export { server, AgentFlowPlugin } from './plugin.js'
export { startServer, stopServer } from './server.js'
export type * from './types.js'
export type * from './trace/traceTypes.js'
export {
  createPatchEnvelope,
  emptyRunSnapshot,
  makeTraceNodeId,
} from './trace/traceTypes.js'
