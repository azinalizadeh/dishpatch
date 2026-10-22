import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DestinationStream, type Logger, pino } from 'pino';
import { pinoHttp } from 'pino-http';

const TOKEN_PATH = /^(\/(?:e|h|api\/invites|api\/host-links)\/)[^/?#]+/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Turns a request path into its route pattern for logs: capability tokens become `:token`, board
 * and slot ids `:id`, and the query string is dropped (07-security.md › Privacy).
 */
export function redactPath(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.replace(TOKEN_PATH, '$1:token').replace(UUID, ':id');
}

export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: undefined,
    redact: { paths: ['req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
  };
  return destination ? pino(options, destination) : pino(options);
}

function withErrorCode(res: ServerResponse, value: object): object {
  const code = (res as ServerResponse & { locals?: { errorCode?: string } }).locals?.errorCode;
  return code ? { ...value, code } : value;
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
    // 4xx/5xx lines carry the API error code (BAD_ORIGIN, RATE_LIMITED…) the error handler set (A09).
    customSuccessObject: (_req, res, value: object) => withErrorCode(res, value),
    customErrorObject: (_req, res, _err, value: object) => withErrorCode(res, value),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
