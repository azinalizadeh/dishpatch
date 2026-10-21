import {
  CATEGORIES,
  type Category,
  CreateEventInput,
  CreateEventResponse,
  LIMITS,
} from '@dishpatch/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiRequestError, NetworkError, postJson } from '../api/client.ts';
import { rememberCreatedBoard } from '../api/created-board.ts';
import { rememberJoin } from '../api/joined-boards.ts';
import { CATEGORY_LABELS } from '../categories.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { TextField } from '../components/TextField.tsx';
import { Toast } from '../components/Toast.tsx';

const DEFAULT_COUNTS: Record<Category, number> = {
  main: 3,
  side: 3,
  salad: 2,
  dessert: 2,
  drinks: 2,
};

const FIELDS = ['title', 'startsAt', 'location', 'hostName', 'slots'] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;
type Failure =
  | { kind: 'fields'; count: number }
  | { kind: 'rate-limited'; minutes: number }
  | { kind: 'offline' }
  | { kind: 'server'; requestId: string | undefined };

/** `datetime-local` gives local wall time without an offset; the API wants an ISO instant. */
function toIso(local: string): string {
  const time = Date.parse(local);
  return Number.isNaN(time) ? local : new Date(time).toISOString();
}

/** The current local time as a `datetime-local` value, for the input's `min`. */
function localNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fieldErrorsFrom(entries: [string, string][]): FieldErrors {
  const errors: FieldErrors = {};
  for (const [path, message] of entries) {
    const key = path.split('.')[0];
    const field = FIELDS.find((f) => f === key);
    if (field) errors[field] ??= message;
  }
  return errors;
}

function failureMessage(failure: Failure): string {
  switch (failure.kind) {
    case 'fields':
      return `Fix ${failure.count} ${failure.count === 1 ? 'field' : 'fields'} to create your board.`;
    case 'rate-limited':
      return `You've made a lot of boards — try again in ${failure.minutes} ${
        failure.minutes === 1 ? 'minute' : 'minutes'
      }.`;
    case 'offline':
      return "You're offline, nothing was created.";
    case 'server':
      return `Something broke on our side. Please try again.${
        failure.requestId ? ` (Request id: ${failure.requestId})` : ''
      }`;
  }
}

export function CreateScreen() {
  const navigate = useNavigate();
  // "Board deleted" after a host deletes their board (03-design.md › host › Interactions).
  const { state, pathname } = useLocation();
  const [toast, setToast] = useState<string | null>(
    () => (state as { toast?: string } | null)?.toast ?? null,
  );
  // Shown once: clear it from history so a reload or Back doesn't show it again.
  useEffect(() => {
    if ((state as { toast?: string } | null)?.toast) {
      navigate(pathname, { replace: true, state: null });
    }
  }, [state, pathname, navigate]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [hostName, setHostName] = useState('');
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const total = CATEGORIES.reduce((sum, c) => sum + counts[c], 0);

  // On a failed submit focus moves to the summary banner (03-design.md › create › Accessibility).
  useEffect(() => {
    if (failure) bannerRef.current?.focus();
  }, [failure]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;
    const parsed = CreateEventInput.safeParse({
      title,
      startsAt: toIso(date),
      location,
      hostName,
      hostDietaryNeeds: [],
      slots: CATEGORIES.map((category) => ({ category, count: counts[category] })),
    });
    if (!parsed.success) {
      const next = fieldErrorsFrom(
        parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
      );
      setErrors(next);
      setFailure({ kind: 'fields', count: Object.keys(next).length });
      return;
    }

    setErrors({});
    setFailure(null);
    setSubmitting(true);
    try {
      const created = await postJson('/api/events', CreateEventResponse, parsed.data);
      rememberCreatedBoard(parsed.data, created);
      navigate(`/events/${created.eventId}/share`);
      // The host already has a session: opening their own invite link here goes to the board
      // instead of joining a second time as a guest. Best-effort, after the board exists.
      try {
        void rememberJoin(
          new URL(created.inviteUrl).pathname.split('/').pop() ?? '',
          created.eventId,
        );
      } catch {
        // An unparseable inviteUrl only costs the shortcut.
      }
    } catch (err) {
      setSubmitting(false);
      if (err instanceof NetworkError) {
        setFailure({ kind: 'offline' });
      } else if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED') {
        setFailure({
          kind: 'rate-limited',
          minutes: Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60)),
        });
      } else if (err instanceof ApiRequestError && err.code === 'VALIDATION') {
        const next = fieldErrorsFrom(Object.entries(err.fields));
        setErrors(next);
        setFailure({ kind: 'fields', count: Math.max(1, Object.keys(next).length) });
      } else {
        setFailure({
          kind: 'server',
          requestId: err instanceof ApiRequestError ? err.requestId : undefined,
        });
      }
    }
  }

  return (
    <section aria-labelledby="create-h">
      <div className="mx-auto grid max-w-[1200px] items-start gap-s5 p-s4 tablet:grid-cols-[1.05fr_1fr] tablet:gap-s7 tablet:p-s6">
        <div>
          <p className="mb-s3 text-xs/[1.5] font-bold uppercase tracking-[0.02em] text-muted">
            Potluck sign-up, minus the spreadsheet
          </p>
          <h1 id="create-h" className="mb-s4 text-[38px] leading-[1.02] tablet:text-[56px]">
            Who's bringing{' '}
            <em className="inline-block -rotate-[1.5deg] rounded-lg bg-accent px-[0.15em] not-italic text-on-accent">
              what?
            </em>
          </h1>
          <p className="max-w-[30ch] text-[17px] text-muted tablet:text-[20px]">
            Make a board, share one link, and watch dishes get claimed live. Dishpatch also tells
            you when nobody's bringing anything your vegan friends can eat.
          </p>
          <div aria-hidden="true" className="mt-s6 hidden flex-wrap gap-s3 tablet:flex">
            <Sticker dish="Ghormeh sabzi" initials="RZ" name="Reza" edge="border-l-cat-main" />
            <Sticker
              dish="Saffron rice pudding"
              initials="LE"
              name="Leila"
              edge="border-l-cat-dessert"
              tilt="rotate-[0.5deg]"
            />
          </div>
        </div>

        <form
          noValidate
          aria-describedby={failure ? 'create-err' : undefined}
          onSubmit={submit}
          className="flex flex-col gap-s5 rounded-lg border border-border bg-surface p-s4 shadow-e1 tablet:p-s6"
        >
          <h2 className="text-2xl leading-[1.2]">New potluck</h2>
          {failure ? (
            <Banner
              ref={bannerRef}
              id="create-err"
              role="alert"
              tone="error"
              icon="!"
              action={
                failure.kind === 'offline' ? (
                  <Button variant="ghost" size="sm" onClick={() => void submit()}>
                    Try again
                  </Button>
                ) : null
              }
            >
              {failureMessage(failure)}
            </Banner>
          ) : null}

          <TextField
            id="c-title"
            label="Event name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.titleMax}
            readOnly={submitting}
            required
            error={errors.title}
          />
          <div className="grid gap-s4 tablet:grid-cols-2">
            <TextField
              id="c-date"
              label="Date & time"
              type="datetime-local"
              value={date}
              min={localNow()}
              onChange={(e) => setDate(e.target.value)}
              readOnly={submitting}
              required
              error={errors.startsAt}
            />
            <TextField
              id="c-loc"
              label={
                <>
                  Where <span className="text-muted">(optional)</span>
                </>
              }
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={LIMITS.locationMax}
              readOnly={submitting}
              error={errors.location}
            />
          </div>
          <TextField
            id="c-host"
            label="Your name"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            maxLength={LIMITS.nameMax}
            autoComplete="given-name"
            readOnly={submitting}
            required
            error={errors.hostName}
          />

          <fieldset
            className="flex flex-col gap-s1"
            aria-describedby={errors.slots ? 'c-slots-err' : undefined}
          >
            <legend className="mb-s1 text-sm/[1.5] font-bold">Slots to fill</legend>
            <div className="flex flex-col gap-s2">
              {CATEGORIES.map((category) => {
                const { plural, dot } = CATEGORY_LABELS[category];
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between border-b border-dashed border-border py-s2 last:border-b-0"
                  >
                    <span className="inline-flex items-center gap-s2 font-bold">
                      <span aria-hidden="true" className={`size-3 rounded-[4px] ${dot}`} />
                      {plural}
                    </span>
                    <Stepper
                      noun={plural.toLowerCase()}
                      value={counts[category]}
                      min={0}
                      max={Math.min(
                        LIMITS.slotsPerCategoryMax,
                        counts[category] + LIMITS.slotsTotalMax - total,
                      )}
                      disabled={submitting}
                      onChange={(value) => setCounts((c) => ({ ...c, [category]: value }))}
                    />
                  </div>
                );
              })}
            </div>
            {errors.slots ? (
              <span id="c-slots-err" className="text-sm/[1.5] font-semibold text-error">
                {errors.slots}
              </span>
            ) : null}
          </fieldset>

          <Button type="submit" loading={submitting} loadingLabel="Creating…">
            Create board
          </Button>
          <p className="text-xs/[1.5] tracking-[0.02em] text-muted">
            No account needed. Boards and guest names are deleted 14 days after the event.
          </p>
        </form>
      </div>
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}

function Sticker({
  dish,
  initials,
  name,
  edge,
  tilt = '-rotate-[0.6deg]',
}: {
  dish: string;
  initials: string;
  name: string;
  edge: string;
  tilt?: string;
}) {
  return (
    <div
      className={`flex min-h-24 w-[200px] flex-col justify-between gap-s2 rounded-lg border border-l-8 border-border bg-surface px-s4 py-s3 shadow-e2 ${edge} ${tilt}`}
    >
      <span className="text-[17px] font-bold leading-[1.25]">{dish}</span>
      <span className="flex items-center gap-s2 text-sm/[1.5] text-muted">
        <span className="inline-grid size-6 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-on-accent">
          {initials}
        </span>
        {name}
      </span>
    </div>
  );
}
