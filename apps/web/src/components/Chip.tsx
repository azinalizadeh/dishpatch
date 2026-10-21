import type { ReactNode } from 'react';

interface ChipProps {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Toggle chip (03-design.md › Chip): a `<button aria-pressed>`, so Space and Enter work for free.
 * It is 40 px tall like the design; the invisible `after:` layer stretches the hit area to 48 px.
 */
export function Chip({ pressed, onToggle, disabled, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex min-h-10 cursor-pointer items-center gap-[6px] rounded-pill border-[1.5px] px-s4 text-sm/[1.5] font-semibold text-ink after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ${
        pressed ? 'border-primary bg-primary-soft' : 'border-border-ui bg-surface'
      }`}
    >
      {pressed ? (
        <span aria-hidden="true" className="font-extrabold text-primary">
          ✓
        </span>
      ) : null}
      {children}
    </button>
  );
}
