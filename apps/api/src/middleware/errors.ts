import type { ApiError } from '@dishpatch/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { DomainError, notFound } from '../domain/errors.ts';

function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) return undefined;
  return typeof err.type === 'string' ? err.type : undefined;
}

function toDomainError(err: unknown): DomainError | null {
  if (err instanceof DomainError) return err;
  const type = bodyParserErrorType(err);
  if (type === 'entity.too.large') {
    return new DomainError(413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
  }
  if (type === 'entity.parse.failed') {
    return new DomainError(400, 'VALIDATION', "We couldn't read that request.");
  }
  return null;
}

/** Any unmatched route (any method) gets the standard JSON 404 body. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound());
};

/** Central error middleware; registered last. Unknown errors become 500 INTERNAL with no internals. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const known = toDomainError(err);
  if (!known) req.log.error({ err }, 'unhandled error');

  const body: ApiError = {
    error: {
      ...known?.details,
      code: known?.code ?? 'INTERNAL',
      message: known?.message ?? 'Something went wrong on our side. Please try again.',
      requestId: String(req.id),
    },
  };
  res.locals.errorCode = body.error.code;
  res.status(known?.status ?? 500).json(body);
};
