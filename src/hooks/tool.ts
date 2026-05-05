import type { AgentEvent, EventBroadcaster } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';
import { isToolInput, isToolOutput, asString, asOptionalString } from '../util/guards.js';
import { redactSecrets } from '../util/redact.js';

function toolToAgent(tool: string, args?: Record<string, unknown>): string {
  if (args?.agent && typeof args.agent === 'string') return args.agent;

  const toolMap: Record<string, string> = {
    'task': 'delegator',
    'todowrite': 'delegator',
    'bash': 'shell',
    'read': 'reader',
    'write': 'writer',
    'edit': 'editor',
    'grep': 'searcher',
    'glob': 'finder',
    'webfetch': 'fetcher',
    'skill': 'skill-loader',
  };

  for (const [prefix, agent] of Object.entries(toolMap)) {
    if (tool.startsWith(prefix)) return agent;
  }

  return 'opencode';
}

interface ToolInput {
  tool: string;
  sessionID?: string;
  args?: Record<string, unknown>;
}

interface ToolOutput {
  result?: string;
  error?: string;
}

export function createToolHooks(store: PluginStore, container: PluginContainer, broadcast?: EventBroadcaster) {

  return {
    'tool.execute.before': async (input: unknown) => {
      if (!isToolInput(input)) return;
      const ti = input as ToolInput;
      const sessionId = ti.sessionID;
      if (!sessionId) return;

      const { tool, args } = ti;
      const agent = toolToAgent(tool, args);

      if (!container.inFlight.has(tool)) {
        container.inFlight.set(tool, []);
      }
      container.inFlight.get(tool)!.push({ agent, startedAt: Date.now() });

      const event: AgentEvent = {
        id: generateId(),
        sessionId,
        type: 'task',
        agent,
        payload: {
          action: tool,
          description: `Executing: ${tool}`,
          args: redactSecrets(args || {}) as Record<string, unknown>,
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
      broadcast?.(event);

      if (tool === 'task' || tool === 'todowrite') {
        const subagent = asOptionalString(args?.subagent_type);
        if (subagent) {
          const dispatchEvent: AgentEvent = {
            id: generateId(),
            sessionId,
            type: 'dispatch',
            agent: 'opencode',
            targetAgent: subagent,
            payload: {
              reason: asString(args?.description, `Dispatch to ${subagent}`),
            },
            timestamp: Date.now(),
          };
          await store.addEvent(dispatchEvent);
          broadcast?.(dispatchEvent);
        }
      }

      if (tool === 'skill') {
        const skillName = asOptionalString(args?.name);
        if (skillName && skillName !== 'agent-flow') {
          const skillEvent: AgentEvent = {
            id: generateId(),
            sessionId,
            type: 'message',
            agent: 'opencode',
            payload: {
              action: 'skill-loaded',
              description: `Loaded skill: ${skillName}`,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(skillEvent);
          broadcast?.(skillEvent);
        }
      }
    },

    'tool.execute.after': async (input: unknown, output: unknown) => {
      if (!isToolInput(input)) return;
      if (!isToolOutput(output)) return;
      const ti = input as ToolInput;
      const sessionId = ti.sessionID;
      if (!sessionId) return;

      const { tool, args } = ti;

      const stack = container.inFlight.get(tool);
      const flight = stack?.shift();
      if (stack?.length === 0) container.inFlight.delete(tool);

      const agent = flight?.agent || toolToAgent(tool, args);
      const duration = flight ? Date.now() - flight.startedAt : 0;

      const to = output as ToolOutput;

      if (to.error) {
        const event: AgentEvent = {
          id: generateId(),
          sessionId,
          type: 'error',
          agent,
          payload: {
            action: tool,
            description: typeof to.error === 'string' ? to.error : 'Tool error',
            error: typeof to.error === 'string' ? undefined : { message: String(to.error) },
            duration,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
        broadcast?.(event);
      } else {
        const event: AgentEvent = {
          id: generateId(),
          sessionId,
          type: 'complete',
          agent,
          payload: {
            action: tool,
            description: `Completed: ${tool}`,
            duration,
            result: typeof to?.result === 'string' ? to.result.slice(0, 200) : undefined,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
        broadcast?.(event);
      }
    },
  };
}
