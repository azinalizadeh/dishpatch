import type { Express } from 'express';
import request from 'supertest';

export const ORIGIN = 'http://localhost:5173';

/** A same-origin JSON POST, as the SPA sends it. */
export function post(app: Express, path: string, body?: object) {
  const req = request(app).post(path).set('Origin', ORIGIN);
  return body === undefined ? req : req.send(body);
}

/** The value and attributes of the dp_sess cookie in a response. */
export function sessionCookie(setCookie: string | string[] | undefined) {
  const header = [setCookie ?? []].flat().find((c) => c.startsWith('dp_sess='));
  if (!header) return undefined;
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  return {
    value: decodeURIComponent(pair.slice('dp_sess='.length)),
    attributes: attributes.map((a) => a.toLowerCase()),
  };
}
