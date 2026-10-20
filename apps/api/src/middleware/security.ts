import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { DomainError } from '../domain/errors.ts';

/** Exact headers from 07-security.md › Security headers. */
export function securityHeaders({ production }: { production: boolean }): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      xContentTypeOptions: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      // Only the headers 07-security.md lists; frame-ancestors already replaces X-Frame-Options.
      originAgentCluster: false,
      xDnsPrefetchControl: false,
      xDownloadOptions: false,
      xFrameOptions: false,
      xPermittedCrossDomainPolicies: false,
      xXssProtection: false,
    }),
    (_req, res, next) => {
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    },
  ];
}

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

function hasBody(headers: Record<string, string | string[] | undefined>): boolean {
  if (headers['transfer-encoding'] !== undefined) return true;
  const length = headers['content-length'];
  return length !== undefined && length !== '0';
}

/** Bodies must be JSON (CSRF defence, T2); anything else is 415. */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  if (hasBody(req.headers) && !req.is('application/json')) {
    next(new DomainError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must be sent as JSON.'));
    return;
  }
  next();
};
