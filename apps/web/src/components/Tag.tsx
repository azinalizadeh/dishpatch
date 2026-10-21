import type { ReactNode } from 'react';

/** Small grey label (design/mockup.html › .tag): dietary tags, "Host". */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-pill bg-surface-2 px-s2 text-xs font-bold text-muted">
      {children}
    </span>
  );
}
