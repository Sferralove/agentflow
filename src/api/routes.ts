import express from 'express';
import type { JsonStore } from '../store/json-store';

export function createAPIRouter(store: JsonStore): express.Router {
  const router = express.Router();

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

  return router;
}
