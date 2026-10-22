import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  labelledBy: string;
  onClose: () => void;
  /** Gets focus when the dialog opens; otherwise the first focusable element does. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** `alertdialog` for destructive confirms: Esc and the scrim don't close it (03-design.md › host). */
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog (03-design.md › claim): centred card on desktop, bottom sheet on mobile, over a
 * dimmed scrim. Tab stays inside, Esc and a scrim click close it (not for an alertdialog), and
 * focus goes back to whatever had it before (the slot button) when it closes.
 */
export function Dialog({
  labelledBy,
  onClose,
  initialFocus,
  role = 'dialog',
  children,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const dismissible = role === 'dialog';
  const onCloseRef = useRef(dismissible ? onClose : () => {});
  onCloseRef.current = dismissible ? onClose : () => {};

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const head = items[0];
      const tail = items.at(-1);
      if (!head || !tail) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === head || !panel.current.contains(active))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (active === tail || !panel.current.contains(active))) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [initialFocus]);

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: the scrim click is a mouse shortcut; Esc and Cancel are the keyboard ways out.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled on the document while the dialog is open.
    <div
      className="fixed inset-0 z-20 grid place-items-end justify-items-stretch bg-scrim tablet:place-items-center tablet:p-s4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is dialog or alertdialog; both are modal. */}
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="flex w-full flex-col gap-s5 rounded-t-lg bg-surface p-s5 text-ink shadow-e3 tablet:w-[min(520px,100%)] tablet:rounded-lg tablet:p-s6"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
