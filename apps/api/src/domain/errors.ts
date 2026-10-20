/** Typed errors thrown by domain services; the error middleware maps them to HTTP responses. */
export class DomainError extends Error {
  override name = 'DomainError';
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = () => new DomainError(404, 'NOT_FOUND', "We couldn't find that.");
