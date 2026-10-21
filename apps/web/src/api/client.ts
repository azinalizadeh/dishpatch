import { ApiErrorSchema } from '@dishpatch/shared';

/** Shown for any failure the API didn't explain (03-design.md: never raw codes). */
export const GENERIC_ERROR_COPY = 'Something went wrong on our side. Please try again.';

/** An error answer from the API, in the one shape every endpoint uses. */
export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly fields: Record<string, string>;
  readonly retryAfterSeconds: number | undefined;
  /** Who won the slot, on 409 SLOT_TAKEN. */
  readonly claimedBy: string | undefined;

  constructor(status: number, body: unknown) {
    const parsed = ApiErrorSchema.safeParse(body);
    const error = parsed.success ? parsed.data.error : undefined;
    super(error?.message ?? GENERIC_ERROR_COPY);
    this.status = status;
    this.code = error?.code ?? 'INTERNAL';
    this.requestId = error?.requestId;
    this.fields = error?.fields ?? {};
    this.retryAfterSeconds = error?.retryAfterSeconds;
    this.claimedBy = error?.claimedBy;
  }
}

/** The request never reached the API (offline, DNS, connection refused) or timed out. */
export class NetworkError extends Error {
  override name = 'NetworkError';
}

type Schema<T> = { parse: (data: unknown) => T };

async function requestJson<T>(path: string, schema: Schema<T>, init: RequestInit): Promise<T> {
  let res: Response;
  let data: unknown;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init });
    data = await res.json().catch(() => undefined);
  } catch {
    throw new NetworkError('Network request failed');
  }
  if (!res.ok) throw new ApiRequestError(res.status, data);
  return schema.parse(data);
}

/** GETs JSON from the same-origin API (cookies included) and parses the answer with `schema`. */
export function getJson<T>(path: string, schema: Schema<T>): Promise<T> {
  return requestJson(path, schema, { method: 'GET' });
}

/** POSTs JSON to the same-origin API (cookies included) and parses the answer with `schema`. */
export function postJson<T>(
  path: string,
  schema: Schema<T>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson(path, schema, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
    signal: signal ?? null,
  });
}

/** DELETEs on the same-origin API (cookies included) and parses the answer with `schema`. */
export function deleteJson<T>(path: string, schema: Schema<T>, signal?: AbortSignal): Promise<T> {
  return requestJson(path, schema, { method: 'DELETE', signal: signal ?? null });
}
