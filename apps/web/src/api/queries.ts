import { Snapshot } from '@dishpatch/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError, getJson } from './client.ts';

export const boardKey = (eventId: string) => ['board', eventId] as const;

export const isNotFound = (err: unknown) => err instanceof ApiRequestError && err.status === 404;

/**
 * The board snapshot (API #5). The SSE stream keeps it fresh by patching this cache entry, so it
 * never goes stale on its own; it is refetched only on `resync` or after a refused stream.
 */
export function useBoardSnapshot(eventId: string) {
  return useQuery({
    queryKey: boardKey(eventId),
    queryFn: () => getJson(`/api/events/${encodeURIComponent(eventId)}`, Snapshot),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    // A 404 means "not a member" (or no such board): retrying won't change that.
    retry: (failures, err) => !isNotFound(err) && failures < 2,
  });
}
