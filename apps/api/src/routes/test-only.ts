import { Router } from 'express';

/** Mounted only when NODE_ENV=test, to exercise the error handler and log redaction. */
export function testOnlyRouter(): Router {
  const router = Router();
  router.get('/__test/error', () => {
    throw new Error('forced failure with internal detail /srv/secret.ts:42');
  });
  router.get('/__test/set-cookie', (_req, res) => {
    res.cookie('dp_sess', 'set-cookie-secret-value', { httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });
  router.post('/__test/echo', (req, res) => {
    res.json({ keys: Object.keys(req.body ?? {}) });
  });
  return router;
}
