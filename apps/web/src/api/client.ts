import { ApiErrorSchema } from '@dishpatch/shared';

/** An error answer from the API, in the one shape every endpoint uses. */
export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly fields: Record<string, string>;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, body: unknown) {
    const parsed = ApiErrorSchema.safeParse(body);
    const error = parsed.success ? parsed.data.error : undefined;
    super(error?.message ?? 'Something went wrong on our side. Please try again.');
    this.status = status;
    this.code = error?.code ?? 'INTERNAL';
    this.requestId = error?.requestId;
    this.fields = error?.fields ?? {};
    this.retryAfterSeconds = error?.retryAfterSeconds;
  }
}

/** The request never reached the API (offline, DNS, connection refused). */
export class NetworkError extends Error {
  override name = 'NetworkError';
}

/** POSTs JSON to the same-origin API (cookies included) and parses the answer with `schema`. */
export async function postJson<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('Network request failed');
  }
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiRequestError(res.status, data);
  return schema.parse(data);
}
