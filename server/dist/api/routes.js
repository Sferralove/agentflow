"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAPIRouter = createAPIRouter;
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const VALID_EVENT_TYPES = ['start', 'complete', 'dispatch', 'task', 'error', 'message'];
function createAPIRouter(store) {
    const router = express_1.default.Router();
    router.use(express_1.default.json());
    router.get('/api/events', async (_req, res) => {
        const events = await store.getEvents();
        res.json(events);
    });
    router.get('/api/sessions', async (_req, res) => {
        const sessions = await store.getAllSessions();
        res.json(sessions);
    });
    router.get('/api/sessions/:id', async (req, res) => {
        const session = await store.getSession(req.params.id);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json(session);
    });
    router.get('/api/agents/:id', async (req, res) => {
        const agent = await store.getAgentInfo(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }
        res.json(agent);
    });
    router.post('/api/agent/event', async (req, res) => {
        try {
            const { type: rawType, agent, sessionId, targetAgent, payload, ...extra } = req.body;
            if (!rawType || !agent || !sessionId) {
                res.status(400).json({ error: 'Missing required fields: type, agent, sessionId' });
                return;
            }
            // Map 'delegation' → 'dispatch' for backward compat with agent prompts
            const type = rawType === 'delegation' ? 'dispatch' : rawType;
            if (!VALID_EVENT_TYPES.includes(type)) {
                res.status(400).json({ error: `Invalid event type: ${type}` });
                return;
            }
            // Merge explicit payload + any extra fields (action, description, tokens, reason, etc.)
            const mergedPayload = { ...extra, ...(payload || {}) };
            const event = {
                id: (0, uuid_1.v4)(),
                sessionId,
                type: type,
                agent,
                targetAgent,
                payload: mergedPayload,
                timestamp: Date.now(),
            };
            await store.addEvent(event);
            res.status(201).json({ success: true, eventId: event.id });
        }
        catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
        }
    });
    return router;
}
//# sourceMappingURL=routes.js.map