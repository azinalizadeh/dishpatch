import { type ReactNode, useState } from 'react';
import { Link, Outlet, useOutletContext } from 'react-router';

interface ShellContext {
  /** Puts something at the right end of the top bar (the board's ConnectionIndicator). */
  setHeaderEnd: (node: ReactNode) => void;
}

/** For screens inside AppShell: fill the top bar's right-hand slot. */
export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}

/** Top bar with the logo, then the routed screen (design/mockup.html › .topbar). */
export function AppShell() {
  const [headerEnd, setHeaderEnd] = useState<ReactNode>(null);
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-s4 tablet:h-16 tablet:px-s6">
        <Link
          to="/"
          aria-label="Dishpatch home"
          className="flex items-center gap-s2 font-heading text-[19px] font-extrabold text-ink no-underline tablet:text-[22px]"
        >
          <span
            aria-hidden="true"
            className="grid size-8 -rotate-6 place-items-center rounded-[10px] bg-accent text-on-accent shadow-e1"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M3 14h18" />
              <path d="M5 14a7 7 0 0 1 14 0" />
              <path d="M12 5v2" />
              <path d="M4 18h16" />
            </svg>
          </span>
          Dishpatch
        </Link>
        {headerEnd}
      </header>
      <main id="main">
        <Outlet context={{ setHeaderEnd } satisfies ShellContext} />
      </main>
    </>
  );
}
