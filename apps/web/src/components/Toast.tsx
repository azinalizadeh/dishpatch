import { useEffect } from 'react';

/** `alert` for errors and conflicts the user should hear at once (03-design.md › Toast). */
export type ToastRole = 'status' | 'alert';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  /** Info toasts leave after 5 s (03-design.md › Toast). */
  durationMs?: number;
  role?: ToastRole;
  /** e.g. "Try again" after a failed release (02-user-flows.md › E8). */
  action?: ToastAction | undefined;
}

const actionClass = 'min-h-10 cursor-pointer rounded-md px-s3 font-bold text-accent';

/**
 * A short message at the bottom of the screen. Info toasts leave by themselves; alerts and toasts
 * with an action stay until dismissed with OK (03-design.md › Toast: errors stay until dismissed).
 */
export function Toast({
  message,
  onDismiss,
  durationMs = 5000,
  role = 'status',
  action,
}: ToastProps) {
  const sticky = role === 'alert' || action !== undefined;

  useEffect(() => {
    if (!message || sticky) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, durationMs, sticky]);

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
      {message && sticky ? (
        <span className="flex gap-s1">
          {action ? (
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                onDismiss();
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ) : null}
          <button type="button" className={actionClass} onClick={onDismiss}>
            OK
          </button>
        </span>
      ) : null}
    </div>
  );
}
