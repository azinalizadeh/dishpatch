import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-s2 rounded-md border-[1.5px] font-bold no-underline cursor-pointer transition-[transform,background-color] duration-[120ms] ease-dp active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-not-allowed aria-busy:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'border-transparent bg-primary text-on-primary hover:brightness-108',
  secondary: 'bg-transparent text-ink border-border-ui hover:bg-surface-2',
  ghost: 'border-transparent bg-transparent text-primary px-s3',
  danger: 'border-transparent bg-error text-on-error',
};

const sizes: Record<Size, string> = {
  md: 'min-h-12 px-s5 text-base',
  sm: 'min-h-10 px-s4 text-sm/[1.5]',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${base} ${sizes[size]} ${variants[variant]} ${extra}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and this label, sets aria-busy and blocks clicks. */
  loadingLabel?: string | undefined;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function Button({
  variant,
  size,
  loading = false,
  loadingLabel,
  className = '',
  type = 'button',
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant, size, className = '', ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
