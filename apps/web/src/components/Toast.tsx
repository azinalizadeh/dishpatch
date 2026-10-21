import { useEffect } from 'react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  /** Info toasts leave after 5 s (03-design.md › Toast). */
  durationMs?: number;
  /** `alert` for conflicts the user should hear at once (03-design.md › board › conflict). */
  role?: 'status' | 'alert';
}

export function Toast({ message, onDismiss, durationMs = 5000, role = 'status' }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  return (
    <div
      role={role}
      className={
        message
          ? 'fixed inset-x-s4 bottom-s4 z-30 flex items-center justify-between gap-s4 rounded-md bg-ink px-s5 py-s3 font-semibold text-bg shadow-e3 tablet:inset-x-auto tablet:bottom-s6 tablet:left-1/2 tablet:w-max tablet:-translate-x-1/2'
          : 'sr-only'
      }
    >
      {message}
    </div>
  );
}
