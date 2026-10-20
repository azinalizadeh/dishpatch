import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DestinationStream, type Logger, pino } from 'pino';
import { pinoHttp } from 'pino-http';

const TOKEN_PATH = /^(\/(?:e|h|api\/invites|api\/host-links)\/)[^/?#]+/;

/** Replaces capability tokens in a path with `:token` and drops the query string. */
export function redactPath(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.replace(TOKEN_PATH, '$1:token');
}

export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: undefined,
    redact: { paths: ['req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
  };
  return destination ? pino(options, destination) : pino(options);
}

export function createHttpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (_req: IncomingMessage, res: ServerResponse) => {
      const id = `req-${randomUUID()}`;
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // Only method, redacted path, status and timing: no headers, IPs, bodies or names (07-security.md › Logging).
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: redactPath(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
