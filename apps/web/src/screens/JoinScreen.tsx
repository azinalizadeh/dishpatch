import {
  DIETARY,
  DIETARY_LABELS,
  type Dietary,
  InvitePreview,
  JoinInput,
  JoinResponse,
  LIMITS,
  Snapshot,
} from '@dishpatch/shared';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiRequestError, getJson, NetworkError, postJson } from '../api/client.ts';
import { forgetJoin, joinedEventFor, rememberJoin } from '../api/joined-boards.ts';
import { Banner } from '../components/Banner.tsx';
import { Button, ButtonLink } from '../components/Button.tsx';
import { Chip } from '../components/Chip.tsx';
import { TextField } from '../components/TextField.tsx';
import { formatWhen } from '../format.ts';

type Problem = 'offline' | 'rate-limited' | 'full' | 'cookies' | 'server';

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: InvitePreview }
  | { kind: 'invalid' }
  | { kind: 'failed'; reason: Problem };

const PROBLEM_COPY: Record<Problem, string> = {
  offline: "You're offline, so we couldn't reach the board. Check your connection and try again.",
  'rate-limited': 'Too many tries. Wait a minute and try again.',
  full: 'This board is full — 100 people have already joined.',
  cookies: 'Dishpatch needs cookies to remember you on this board.',
  server: 'Something broke on our side. Please try again.',
};

function problemFrom(err: unknown): Problem {
  if (err instanceof NetworkError) return 'offline';
  if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED') return 'rate-limited';
  if (err instanceof ApiRequestError && err.code === 'EVENT_FULL') return 'full';
  return 'server';
}

const isInviteInvalid = (err: unknown) =>
  err instanceof ApiRequestError && err.code === 'INVITE_INVALID';

/**
 * `/e/:inviteToken` (03-design.md › join, 02-user-flows.md › Flow B). A browser that already
 * joined goes straight to the board; otherwise it shows the preview and the join form. After
 * joining, the history entry is replaced so the invite token leaves the address bar.
 */
export function JoinScreen() {
  const { inviteToken = '' } = useParams();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const openBoard = useCallback(
    (eventId: string) => navigate(`/events/${eventId}`, { replace: true }),
    [navigate],
  );

  const loadPreview = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const preview = await getJson(
        `/api/invites/${encodeURIComponent(inviteToken)}`,
        InvitePreview,
      );
      setLoad({ kind: 'ready', preview });
    } catch (err) {
      setLoad(
        isInviteInvalid(err) ? { kind: 'invalid' } : { kind: 'failed', reason: problemFrom(err) },
      );
    }
  }, [inviteToken]);

  useEffect(() => {
    let active = true;
    (async () => {
      // Joined from this link before? A snapshot 200 means the session is still good.
      const eventId = await joinedEventFor(inviteToken);
      if (eventId) {
        try {
          await getJson(`/api/events/${eventId}`, Snapshot);
          if (active) openBoard(eventId);
          return;
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 404) await forgetJoin(inviteToken);
        }
      }
      if (active) await loadPreview();
    })();
    return () => {
      active = false;
    };
  }, [inviteToken, loadPreview, openBoard]);

  if (load.kind === 'invalid') return <InviteInvalid />;
  return (
    <div className="mx-auto my-s4 max-w-[640px] px-s4 tablet:my-s7">
      {load.kind === 'loading' ? <CardSkeleton /> : null}
      {load.kind === 'failed' ? (
        <Banner
          tone="error"
          icon="!"
          role="alert"
          action={
            <Button variant="ghost" size="sm" onClick={() => void loadPreview()}>
              Try again
            </Button>
          }
        >
          {PROBLEM_COPY[load.reason]}
        </Banner>
      ) : null}
      {load.kind === 'ready' ? (
        <JoinForm
          inviteToken={inviteToken}
          preview={load.preview}
          onJoined={openBoard}
          onInvalid={() => setLoad({ kind: 'invalid' })}
        />
      ) : null}
    </div>
  );
}

const focusName = () => document.getElementById('j-name')?.focus();

function JoinForm({
  inviteToken,
  preview,
  onJoined,
  onInvalid,
}: {
  inviteToken: string;
  preview: InvitePreview;
  onJoined: (eventId: string) => void;
  onInvalid: () => void;
}) {
  const [name, setName] = useState('');
  const [needs, setNeeds] = useState<Dietary[]>([]);
  const [nameError, setNameError] = useState<string | undefined>();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (problem) bannerRef.current?.focus();
  }, [problem]);

  function toggle(need: Dietary) {
    setNeeds((current) =>
      current.includes(need) ? current.filter((n) => n !== need) : [...current, need],
    );
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;
    setProblem(null);
    const parsed = JoinInput.safeParse({ displayName: name, dietaryNeeds: needs });
    if (!parsed.success) {
      setNameError(parsed.error.issues.find((i) => i.path[0] === 'displayName')?.message);
      focusName();
      return;
    }
    if (!navigator.cookieEnabled) {
      setProblem('cookies');
      return;
    }

    setNameError(undefined);
    setSubmitting(true);
    try {
      const joined = await postJson(
        `/api/invites/${encodeURIComponent(inviteToken)}/join`,
        JoinResponse,
        parsed.data,
      );
      await rememberJoin(inviteToken, joined.eventId);
      onJoined(joined.eventId);
    } catch (err) {
      setSubmitting(false);
      if (isInviteInvalid(err)) {
        onInvalid();
      } else if (err instanceof ApiRequestError && err.code === 'NAME_TAKEN') {
        setNameError(err.message);
        focusName();
      } else if (err instanceof ApiRequestError && err.code === 'VALIDATION') {
        setNameError(err.fields.displayName ?? err.message);
        focusName();
      } else {
        setProblem(problemFrom(err));
      }
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="join-h"
      className="flex flex-col gap-s3 rounded-lg border border-border bg-surface p-s6 shadow-e1"
    >
      <div>
        <p className="text-xs/[1.5] font-bold uppercase tracking-[0.02em] text-muted">
          {preview.hostName} invited you to
        </p>
        <h1 id="join-h" className="mt-s1 text-[32px] leading-[1.15]">
          {preview.title}
        </h1>
        <p className="mt-s2 flex flex-wrap gap-x-s4 gap-y-s1 text-sm/[1.5] font-semibold text-muted">
          <span>
            <span aria-hidden="true">📅 </span>
            {formatWhen(preview.startsAt, { withYear: false })}
          </span>
          {preview.location ? (
            <span>
              <span aria-hidden="true">📍 </span>
              {preview.location}
            </span>
          ) : null}
          <span>
            <span aria-hidden="true">👥 </span>
            {preview.participantCount} going
          </span>
        </p>
      </div>

      {problem ? (
        <Banner
          ref={bannerRef}
          tone="error"
          icon="!"
          role="alert"
          action={
            problem === 'offline' || problem === 'server' ? (
              <Button variant="ghost" size="sm" onClick={() => void submit()}>
                Try again
              </Button>
            ) : null
          }
        >
          {PROBLEM_COPY[problem]}
        </Banner>
      ) : null}

      <TextField
        id="j-name"
        label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        // maxLength counts UTF-16 units; the schema enforces 40 code points, so emoji names fit.
        maxLength={LIMITS.nameMax * 2}
        autoComplete="given-name"
        readOnly={submitting}
        required
        hint="Shown to everyone on this board."
        error={nameError}
      />

      <fieldset className="flex flex-col gap-s2" aria-describedby="j-needs-hint">
        <legend className="mb-s2 text-sm/[1.5] font-bold">
          Anything you can't eat? <span className="font-normal text-muted">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-s2">
          {DIETARY.map((need) => (
            <Chip
              key={need}
              pressed={needs.includes(need)}
              onToggle={() => toggle(need)}
              disabled={submitting}
            >
              {DIETARY_LABELS[need]}
            </Chip>
          ))}
        </div>
        <span id="j-needs-hint" className="text-xs/[1.5] tracking-[0.02em] text-muted">
          Only the board sees this, and it's deleted with the board.
        </span>
      </fieldset>

      <Button type="submit" loading={submitting} loadingLabel="Joining…" className="self-start">
        Join the board
      </Button>
    </form>
  );
}

/** Same card for invalid, rotated and expired links, so it never says which (03-design.md › join/error). */
function InviteInvalid() {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cardRef.current?.focus();
  }, []);
  return (
    <div className="mx-auto my-s4 max-w-[640px] px-s4 tablet:my-s7">
      <div
        ref={cardRef}
        role="alert"
        tabIndex={-1}
        className="flex flex-col items-start gap-s3 rounded-lg border border-border bg-surface p-s6 shadow-e1 focus:outline-none"
      >
        <svg className="size-40" viewBox="0 0 160 160" aria-hidden="true">
          <circle
            cx="80"
            cy="80"
            r="64"
            fill="var(--surface-2)"
            stroke="var(--border-ui)"
            strokeWidth="3"
          />
          <circle
            cx="80"
            cy="80"
            r="40"
            fill="none"
            stroke="var(--border-ui)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          <path
            d="M62 70l36 20M98 70L62 90"
            stroke="var(--error)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
        <h1 className="text-[28px] leading-[1.2]">This invite link doesn't work anymore</h1>
        <p className="text-muted">
          The host may have made a new link, or the event is over. Ask them to send the latest
          invite.
        </p>
        <ButtonLink to="/" variant="secondary">
          Start your own board
        </ButtonLink>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the invite"
      className="flex flex-col gap-s4 rounded-lg border border-border bg-surface p-s6 shadow-e1"
    >
      <span className="h-3 w-40 animate-pulse rounded-sm bg-surface-2" />
      <span className="h-8 w-3/4 animate-pulse rounded-sm bg-surface-2" />
      <span className="h-4 w-1/2 animate-pulse rounded-sm bg-surface-2" />
      <span className="h-12 w-full animate-pulse rounded-md bg-surface-2" />
      <span className="h-10 w-full animate-pulse rounded-md bg-surface-2" />
    </div>
  );
}
