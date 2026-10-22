import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/**
 * Express `trust proxy`: `false` (default, X-Forwarded-For ignored), a hop count such as `1` for
 * a real deploy behind one reverse proxy (only the address that proxy saw is trusted), or `true`
 * (trust every hop, so the client picks its own IP; only for the E2E stack).
 */
const trustProxy = z
  .union([z.enum(['true', 'false']), z.string().regex(/^[1-9]$/)])
  .default('false')
  .transform((v) => (v === 'true' ? true : v === 'false' ? false : Number(v)));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  APP_ORIGIN: z.url({ protocol: /^https?$/ }),
  COOKIE_SECURE: bool,
  TRUST_PROXY: trustProxy,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Validates the environment at boot. The error names variables but never echoes their values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.');
    return source[name] === undefined || source[name] === ''
      ? `${name} is missing`
      : `${name} is invalid`;
  });
  throw new EnvError(
    `Invalid environment: ${problems.join('; ')}. See .env.example for the expected variables.`,
  );
}
