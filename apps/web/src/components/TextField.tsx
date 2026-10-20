import type { InputHTMLAttributes, ReactNode } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
}

/** Labelled input; the error message is linked with aria-describedby (03-design.md › TextField). */
export function TextField({ id, label, error, hint, className = '', ...rest }: TextFieldProps) {
  const errorId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  return (
    <div className={`flex flex-col gap-s1 ${className}`.trim()}>
      <label htmlFor={id} className="text-sm/[1.5] font-bold">
        {label}
      </label>
      <input
        id={id}
        className={`min-h-12 rounded-md border-[1.5px] bg-surface px-s4 text-ink placeholder:text-muted focus:outline-3 focus:outline-offset-1 focus:outline-focus read-only:cursor-default ${
          error ? 'border-error' : 'border-border-ui'
        }`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...rest}
      />
      {hint ? (
        <span id={hintId} className="text-xs/[1.5] tracking-[0.02em] text-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-sm/[1.5] font-semibold text-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
