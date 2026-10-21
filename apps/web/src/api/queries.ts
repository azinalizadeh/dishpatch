import {
  AddSlotResponse,
  type Category,
  type ClaimInput,
  ClaimResponse,
  RotateInviteResponse,
  SeqResponse,
  type SlotView,
  Snapshot,
  UpdateEventResponse,
} from '@dishpatch/shared';
import {
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiRequestError, deleteJson, getJson, NoContent, patchJson, postJson } from './client.ts';

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

const eventPath = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}`;

/** Changes the cached board without touching `seq`, so the stream's own event still applies. */
function patchBoard(queryClient: QueryClient, eventId: string, update: (b: Snapshot) => Snapshot) {
  queryClient.setQueryData<Snapshot>(boardKey(eventId), (board) => (board ? update(board) : board));
}

/**
 * API #9 with an optimistic switch: the board flips at once and flips back if the PATCH fails
 * (unless the stream has meanwhile brought a newer value).
 */
export function useSetLocked(eventId: string) {
  const queryClient = useQueryClient();
  const setLocked = (locked: boolean) =>
    patchBoard(queryClient, eventId, (b) => ({ ...b, event: { ...b.event, locked } }));
  return useMutation<UpdateEventResponse, Error, boolean, { previous: boolean | undefined }>({
    mutationFn: (locked) => patchJson(eventPath(eventId), UpdateEventResponse, { locked }),
    onMutate: (locked) => {
      const previous = queryClient.getQueryData<Snapshot>(boardKey(eventId))?.event.locked;
      setLocked(locked);
      return { previous };
    },
    onError: (_err, locked, context) => {
      const current = queryClient.getQueryData<Snapshot>(boardKey(eventId))?.event.locked;
      if (context?.previous !== undefined && current === locked) setLocked(context.previous);
    },
  });
}

/** API #10. The new slot shows as soon as the API answers; the stream's `slot.added` is a no-op. */
export function useAddSlot(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<AddSlotResponse, Error, Category>({
    mutationFn: (category) =>
      postJson(`${eventPath(eventId)}/slots`, AddSlotResponse, { category }),
    onSuccess: ({ slot }) =>
      patchBoard(queryClient, eventId, (b) =>
        b.slots.some((s) => s.id === slot.id) ? b : { ...b, slots: [...b.slots, slot] },
      ),
  });
}

/** API #11, the same way: gone from the cache on success. */
export function useRemoveSlot(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<SeqResponse, Error, SlotView>({
    mutationFn: (slot) =>
      deleteJson(`${eventPath(eventId)}/slots/${encodeURIComponent(slot.id)}`, SeqResponse),
    onSuccess: (_res, slot) =>
      patchBoard(queryClient, eventId, (b) => ({
        ...b,
        slots: b.slots.filter((s) => s.id !== slot.id),
      })),
    onError: (err) => {
      // Someone claimed it meanwhile, or it's already gone: reload the board.
      if (err instanceof ApiRequestError && err.status !== 429) {
        void queryClient.invalidateQueries({ queryKey: boardKey(eventId) });
      }
    },
  });
}

/** API #12: a fresh invite link; the old one stops working. */
export function useRotateInvite(eventId: string) {
  return useMutation<RotateInviteResponse, Error, void>({
    mutationFn: () => postJson(`${eventPath(eventId)}/invite/rotate`, RotateInviteResponse),
  });
}

/** API #13: deletes the board for everyone once the typed title matches. */
export function useDeleteBoard(eventId: string) {
  return useMutation<void, Error, string>({
    mutationFn: (confirmTitle) =>
      deleteJson(eventPath(eventId), NoContent, undefined, { confirmTitle }),
  });
}
