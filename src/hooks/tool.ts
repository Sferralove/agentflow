import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

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
  args?: Record<string, unknown>;
}

interface ToolOutput {
  result?: string;
  error?: string;
}

export function createToolHooks(store: PluginStore, container: PluginContainer) {

  return {
    'tool.execute.before': async (input: unknown) => {
      const inp = input as ToolInput;
      if (!container.sessionId) return;

      const agent = toolToAgent(inp.tool, inp.args);

      // Push onto FIFO stack for this tool type (handles concurrent executions)
      if (!container.inFlight.has(inp.tool)) {
        container.inFlight.set(inp.tool, []);
      }
      container.inFlight.get(inp.tool)!.push({ agent, startedAt: Date.now() });

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'task',
        agent,
        payload: {
          action: inp.tool,
          description: `Executing: ${inp.tool}`,
          args: inp.args || {},
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);

      // Detect task delegations
      if (inp.tool === 'task' || inp.tool === 'todowrite') {
        const subagent = inp.args?.subagent_type as string | undefined;
        if (subagent) {
          const dispatchEvent: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'dispatch',
            agent: 'opencode',
            targetAgent: subagent,
            payload: {
              reason: (inp.args?.description as string) || `Dispatch to ${subagent}`,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(dispatchEvent);
        }
      }

      // Detect skill loading
      if (inp.tool === 'skill') {
        const skillName = inp.args?.name as string | undefined;
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
      const inp = input as ToolInput;
      const out = output as ToolOutput;
      if (!container.sessionId) return;

      // Pop from FIFO stack (shift = oldest first)
      const stack = container.inFlight.get(inp.tool);
      const flight = stack?.shift();
      if (stack?.length === 0) container.inFlight.delete(inp.tool);

      const agent = flight?.agent || toolToAgent(inp.tool, inp.args);
      const duration = flight ? Date.now() - flight.startedAt : 0;

      if (out?.error) {
        const event: AgentEvent = {
          id: generateId(),
          sessionId: container.sessionId,
          type: 'error',
          agent,
          payload: {
            action: inp.tool,
            description: out.error,
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
            action: inp.tool,
            description: `Completed: ${inp.tool}`,
            duration,
            result: typeof out?.result === 'string' ? out.result.slice(0, 200) : undefined,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
      }
    },
  };
}
