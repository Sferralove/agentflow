import { getCurrentSessionId } from './session.js';
function generateId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
/** Map tool names to agent identities for the flow graph */
function toolToAgent(tool, args) {
    // If the tool args have an explicit agent name, use it
    if (args?.agent && typeof args.agent === 'string')
        return args.agent;
    // Map known tools to agent names
    const toolMap = {
        'task': 'delegator', // dispatching subagents
        'bash': 'shell',
        'read': 'reader',
        'write': 'writer',
        'edit': 'editor',
        'grep': 'searcher',
        'glob': 'finder',
        'webfetch': 'fetcher',
        'skill': 'skill-loader',
    };
    // Check if tool starts with known prefixes
    for (const [prefix, agent] of Object.entries(toolMap)) {
        if (tool.startsWith(prefix))
            return agent;
    }
    return 'opencode';
}
export function createToolHooks(store) {
    // Track in-flight tool executions
    const inFlight = new Map();
    return {
        /** Fires BEFORE a tool executes */
        'tool.execute.before': async (input) => {
            const inp = input;
            const sessionId = getCurrentSessionId();
            if (!sessionId)
                return;
            const agent = toolToAgent(inp.tool, inp.args);
            const executionId = generateId();
            inFlight.set(inp.tool, { tool: inp.tool, agent, startedAt: Date.now() });
            const event = {
                id: executionId,
                sessionId,
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
                const subagent = inp.args?.subagent_type;
                if (subagent) {
                    const dispatchEvent = {
                        id: generateId(),
                        sessionId,
                        type: 'dispatch',
                        agent: 'opencode',
                        targetAgent: subagent,
                        payload: {
                            reason: inp.args?.description || `Dispatch to ${subagent}`,
                        },
                        timestamp: Date.now(),
                    };
                    await store.addEvent(dispatchEvent);
                }
            }
            // Detect skill loading
            if (inp.tool === 'skill') {
                const skillName = inp.args?.name;
                if (skillName && skillName !== 'agent-flow') {
                    const skillEvent = {
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
                }
            }
        },
        /** Fires AFTER a tool executes */
        'tool.execute.after': async (input, output) => {
            const inp = input;
            const out = output;
            const sessionId = getCurrentSessionId();
            if (!sessionId)
                return;
            const flight = inFlight.get(inp.tool);
            const agent = flight?.agent || toolToAgent(inp.tool, inp.args);
            const duration = flight ? Date.now() - flight.startedAt : 0;
            inFlight.delete(inp.tool);
            if (out?.error) {
                // Tool failed
                const event = {
                    id: generateId(),
                    sessionId,
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
            }
            else {
                // Tool succeeded
                const event = {
                    id: generateId(),
                    sessionId,
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
