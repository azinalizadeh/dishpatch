import { useEffect, useRef } from 'react';
import { ButtonLink } from '../components/Button.tsx';

/**
 * One screen for unknown routes, bad host links, deleted boards and boards without a session,
 * with the same copy, so it never confirms that a board exists (03-design.md › notfound).
 */
export function NotFoundScreen({ note }: { note?: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="nf-h"
      className="mx-auto my-s8 flex max-w-[520px] flex-col items-center gap-s4 px-s4 text-center"
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
        <text
          x="80"
          y="92"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="800"
          fontSize="34"
          fill="var(--muted)"
        >
          404
        </text>
      </svg>
      <h1
        id="nf-h"
        ref={headingRef}
        tabIndex={-1}
        className="text-[30px] leading-[1.1] focus:outline-none tablet:text-[40px]"
      >
        Nothing on this plate
      </h1>
      <p className="text-muted">
        This board doesn't exist, was deleted, or you haven't joined it on this device. Open the
        invite link the host sent you.
      </p>
      {note ? <p className="text-sm/[1.5] font-semibold text-muted">{note}</p> : null}
      <ButtonLink to="/">Start a new board</ButtonLink>
    </section>
  );
}
