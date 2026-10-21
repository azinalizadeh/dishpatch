import { type ClaimInput, ClaimResponse, type SlotView, Snapshot } from '@dishpatch/shared';
import {
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiRequestError, deleteJson, getJson, postJson } from './client.ts';

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

/** Shown when a claim or release never reached the API (02-user-flows.md › D14, E8). */
export const NETWORK_ERROR_COPY = "Couldn't reach Dishpatch — try again.";

/** Codes meaning the board itself changed (locked, already open, or gone): reload it, no toast. */
export const BOARD_CHANGED: ReadonlySet<string> = new Set([
  'BOARD_LOCKED',
  'NOT_CLAIMED',
  'NOT_FOUND',
]);

const slotMutationKey = (eventId: string) => ['slot-mutation', eventId] as const;

/** Slots with a claim or release in flight (03-design.md › SlotCard › optimistic, 70% opacity). */
export function usePendingSlotIds(eventId: string): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey: slotMutationKey(eventId), status: 'pending' },
    select: (m) => (m.state.variables as { slot: SlotView } | undefined)?.slot.id,
  });
  return new Set(ids.filter((id): id is string => id !== undefined));
}

/** A claim or release that hasn't answered in 10 s is rolled back (05-features.md › F4 edge cases). */
export const MUTATION_TIMEOUT_MS = 10_000;

const claimPath = (eventId: string, slotId: string) =>
  `/api/events/${encodeURIComponent(eventId)}/slots/${encodeURIComponent(slotId)}/claim`;

/** Replaces one slot in the cached board without touching `seq`, so stream events keep applying. */
function replaceSlot(
  queryClient: QueryClient,
  eventId: string,
  slotId: string,
  update: (current: SlotView) => SlotView,
) {
  queryClient.setQueryData<Snapshot>(boardKey(eventId), (board) =>
    board ? { ...board, slots: board.slots.map((s) => (s.id === slotId ? update(s) : s)) } : board,
  );
}

const sameSlot = (a: SlotView, b: SlotView) => JSON.stringify(a) === JSON.stringify(b);

interface Optimistic {
  previous: SlotView;
  optimistic: SlotView;
}

/**
 * Shared optimistic flow for claim and release. The slot changes in the cache at once; on success
 * it takes the server's version, on failure it goes back. Both only apply while the cached slot
 * still equals our optimistic version: if the stream has replaced it meanwhile (someone else won),
 * the stream's version is newer and stays. (Compared by value: the query cache's structural
 * sharing doesn't keep object identity.)
 */
function useOptimisticSlotMutation<V extends { slot: SlotView }>(
  eventId: string,
  request: (vars: V, signal: AbortSignal) => Promise<ClaimResponse>,
  optimisticSlot: (vars: V) => SlotView,
) {
  const queryClient = useQueryClient();
  return useMutation<ClaimResponse, Error, V, Optimistic>({
    mutationKey: slotMutationKey(eventId),
    mutationFn: (vars) => request(vars, AbortSignal.timeout(MUTATION_TIMEOUT_MS)),
    onMutate: (vars) => {
      const previous =
        queryClient
          .getQueryData<Snapshot>(boardKey(eventId))
          ?.slots.find((s) => s.id === vars.slot.id) ?? vars.slot;
      const optimistic = optimisticSlot(vars);
      replaceSlot(queryClient, eventId, vars.slot.id, () => optimistic);
      return { previous, optimistic };
    },
    onSuccess: (res, vars, context) => {
      replaceSlot(queryClient, eventId, vars.slot.id, (s) =>
        sameSlot(s, context.optimistic) ? res.slot : s,
      );
    },
    onError: (err, vars, context) => {
      if (context) {
        replaceSlot(queryClient, eventId, vars.slot.id, (s) =>
          sameSlot(s, context.optimistic) ? context.previous : s,
        );
      }
      // The board changed under us (locked, or we're no longer a member): reload it.
      if (err instanceof ApiRequestError && BOARD_CHANGED.has(err.code)) {
        void queryClient.invalidateQueries({ queryKey: boardKey(eventId) });
      }
    },
  });
}

export interface ClaimVars {
  slot: SlotView;
  me: { id: string; displayName: string };
  input: ClaimInput;
}

/** API #7 with an optimistic "mine" card (01-product.md › US-07). */
export function useClaimSlot(eventId: string) {
  return useOptimisticSlotMutation<ClaimVars>(
    eventId,
    ({ slot, input }, signal) =>
      postJson(claimPath(eventId, slot.id), ClaimResponse, input, signal),
    ({ slot, me, input }) => ({
      ...slot,
      claimedBy: me,
      dishName: input.dishName,
      dishTags: input.dishTags,
    }),
  );
}

/** API #8 with an optimistic open slot (01-product.md › US-09). */
export function useReleaseSlot(eventId: string) {
  return useOptimisticSlotMutation<{ slot: SlotView }>(
    eventId,
    ({ slot }, signal) => deleteJson(claimPath(eventId, slot.id), ClaimResponse, signal),
    ({ slot }) => ({ ...slot, claimedBy: null, dishName: null, dishTags: [] }),
  );
}
