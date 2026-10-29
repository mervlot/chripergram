import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import { ButtonTone, ButtonVariant, ControlSize, buttonClass, cn } from '../../lib/ui';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ControlSize;
  pill?: boolean;
  fullWidth?: boolean;
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

/**
 * Text button. Use `variant="glass"` only for buttons floating over media or
 * scrolling content; use `primary` / `secondary` for form and dialog actions.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    tone,
    size = 'md',
    pill,
    fullWidth,
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, tone, size, pill, fullWidth }), className)}
      {...rest}
    >
      {loading ? <ButtonSpinner /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
