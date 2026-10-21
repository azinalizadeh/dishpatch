/** Every `error.code` the API can return (04-architecture.md › API contract). */
export const ERROR_CODES = [
  'VALIDATION',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL',
  'BAD_ORIGIN',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'INVITE_INVALID',
  'NAME_TAKEN',
  'EVENT_FULL',
  'TOO_MANY_STREAMS',
  'SLOT_TAKEN',
  'CLAIM_LIMIT',
  'BOARD_LOCKED',
  'NOT_OWNER',
  'NOT_CLAIMED',
  'HOST_ONLY',
  'SLOT_LIMIT',
  'SLOT_CLAIMED',
  'CONFIRM_MISMATCH',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
