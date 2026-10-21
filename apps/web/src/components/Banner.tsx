import { forwardRef, type ReactNode } from 'react';

type Tone = 'ok' | 'warn' | 'error';

const tones: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok-ink',
  warn: 'bg-warn-bg text-warn-ink',
  error: 'bg-err-bg text-err-ink',
};

interface BannerProps {
  tone: Tone;
  icon: string;
  children: ReactNode;
  id?: string;
  role?: 'alert' | 'status';
  action?: ReactNode;
}

/** Static message strip (03-design.md › Banner). Focusable so forms can move focus to it. */
export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { tone, icon, children, id, role, action },
  ref,
) {
  return (
    <div
      ref={ref}
      id={id}
      role={role}
      tabIndex={-1}
      className={`flex items-start gap-s3 rounded-md px-s4 py-s3 text-sm/[1.5] font-semibold ${tones[tone]}`}
    >
      <span aria-hidden="true" className="text-lg leading-[1.2]">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
});
