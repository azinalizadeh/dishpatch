import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { testApp, testEnv } from './helpers/test-app.ts';

const EXPECTED_CSP =
  "default-src 'self';script-src 'self';style-src 'self';font-src 'self';img-src 'self' data:;" +
  "connect-src 'self';frame-ancestors 'none';base-uri 'none';form-action 'self';object-src 'none'";

describe('security headers', () => {
  const db = useTestDb();
  const { app } = intApp(db);

  it("CSP has script-src 'self' and no unsafe-inline", async () => {
    for (const path of ['/', '/api/health']) {
      const res = await request(app).get(path);
      const csp = res.headers['content-security-policy'];
      expect(csp, path).toBe(EXPECTED_CSP);
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    }
  });

  it('sets Referrer-Policy no-referrer', async () => {
    for (const path of ['/', '/api/health']) {
      const res = await request(app).get(path);
      expect(res.headers['referrer-policy'], path).toBe('no-referrer');
    }
  });

  it('api responses are Cache-Control no-store and have no x-powered-by', async () => {
    for (const path of ['/api/health', '/api/nope']) {
      const res = await request(app).get(path);
      expect(res.headers['cache-control'], path).toBe('no-store');
      expect(res.headers['x-powered-by'], path).toBeUndefined();
    }
    const html = await request(app).get('/');
    expect(html.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the remaining baseline headers from 07-security.md', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    });
    expect(res.headers['strict-transport-security']).toBeUndefined();
    for (const extra of ['x-frame-options', 'x-xss-protection', 'origin-agent-cluster']) {
      expect(res.headers[extra], extra).toBeUndefined();
    }
  });

  it('adds HSTS in production only', async () => {
    const { app: prod } = testApp({ db, env: testEnv({ NODE_ENV: 'production' }) });
    const res = await request(prod).get('/api/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});
