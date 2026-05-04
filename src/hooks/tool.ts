import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';
import { isToolInput, isToolOutput, asString, asOptionalString } from '../util/guards.js';

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

export function createToolHooks(store: PluginStore, container: PluginContainer) {

  return {
    'tool.execute.before': async (input: unknown) => {
      if (!isToolInput(input)) return;
      if (!container.sessionId) return;

      const { tool, args } = input;
      const agent = toolToAgent(tool, args);

      // Push onto FIFO stack for this tool type (handles concurrent executions)
      if (!container.inFlight.has(tool)) {
        container.inFlight.set(tool, []);
      }
      container.inFlight.get(tool)!.push({ agent, startedAt: Date.now() });

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'task',
        agent,
        payload: {
          action: tool,
          description: `Executing: ${tool}`,
          args: args || {},
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);

      // Detect task delegations
      if (tool === 'task' || tool === 'todowrite') {
        const subagent = asOptionalString(args?.subagent_type);
        if (subagent) {
          const dispatchEvent: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'dispatch',
            agent: 'opencode',
            targetAgent: subagent,
            payload: {
              reason: asString(args?.description, `Dispatch to ${subagent}`),
            },
            timestamp: Date.now(),
          };
          await store.addEvent(dispatchEvent);
        }
      }

      // Detect skill loading
      if (tool === 'skill') {
        const skillName = asOptionalString(args?.name);
        if (skillName && skillName !== 'agent-flow') {
          const skillEvent: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'message',
            agent: 'opencode',
            payload: {
              action: 'skill-loaded',
              description: `Loaded skill: ${skillName}`,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(skillEvent);
        }
      }
    },

    'tool.execute.after': async (input: unknown, output: unknown) => {
      if (!isToolInput(input)) return;
      if (!isToolOutput(output)) return;
      if (!container.sessionId) return;

      const { tool, args } = input;

      // Pop from FIFO stack (shift = oldest first)
      const stack = container.inFlight.get(tool);
      const flight = stack?.shift();
      if (stack?.length === 0) container.inFlight.delete(tool);

      const agent = flight?.agent || toolToAgent(tool, args);
      const duration = flight ? Date.now() - flight.startedAt : 0;

      if (output.error) {
        const event: AgentEvent = {
          id: generateId(),
          sessionId: container.sessionId,
          type: 'error',
          agent,
          payload: {
            action: tool,
            description: output.error,
            duration,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
      } else {
        const event: AgentEvent = {
          id: generateId(),
          sessionId: container.sessionId,
          type: 'complete',
          agent,
          payload: {
            action: tool,
            description: `Completed: ${tool}`,
            duration,
            result: typeof output?.result === 'string' ? output.result.slice(0, 200) : undefined,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
      }
    },
  };
}
