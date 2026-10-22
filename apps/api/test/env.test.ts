import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from '../src/env.ts';

const valid = {
  DATABASE_URL: 'postgres://dishpatch:super-secret-pw@localhost:5432/dishpatch',
  APP_ORIGIN: 'http://localhost:5173',
};

describe('env', () => {
  it('boot fails with a clear message when DATABASE_URL is missing', () => {
    const server = fileURLToPath(new URL('../src/server.ts', import.meta.url));
    const result = spawnSync(process.execPath, [server], {
      env: { PATH: process.env.PATH, APP_ORIGIN: valid.APP_ORIGIN },
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is missing');
    expect(result.stderr).not.toContain(valid.APP_ORIGIN);
  });

  it('names an invalid variable without echoing its value', () => {
    const attempt = () => loadEnv({ ...valid, APP_ORIGIN: 'not-an-origin-SECRET' });
    expect(attempt).toThrow(EnvError);
    expect(attempt).toThrow(/APP_ORIGIN is invalid/);
    try {
      attempt();
    } catch (err) {
      expect(String(err)).not.toContain('SECRET');
    }
  });

  it('applies defaults and parses booleans', () => {
    const env = loadEnv({ ...valid, COOKIE_SECURE: 'true' });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      COOKIE_SECURE: true,
      TRUST_PROXY: false,
      LOG_LEVEL: 'info',
      CLEANUP_INTERVAL_MINUTES: 60,
    });
  });

  it('TRUST_PROXY takes false, true or a hop count', () => {
    expect(loadEnv({ ...valid, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...valid, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => loadEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY is invalid/);
    expect(() => loadEnv({ ...valid, TRUST_PROXY: '0' })).toThrow(/TRUST_PROXY is invalid/);
  });
});
