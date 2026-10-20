import { Router } from 'express';
import { type Db, pingDb } from '../db/client.ts';

export function healthRouter(db: Db): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const ok = await pingDb(db);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', db: ok ? 'ok' : 'down' });
  });
  return router;
}
