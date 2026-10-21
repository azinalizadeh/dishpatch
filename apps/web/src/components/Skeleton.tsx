/** Placeholder block shown while data loads (03-design.md › Skeleton). Size it with `className`. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse bg-surface-2 ${className}`} />;
}
