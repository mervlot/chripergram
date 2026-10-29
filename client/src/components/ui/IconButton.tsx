import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import { ButtonTone, ButtonVariant, ControlSize, cn, buttonClass } from '../../lib/ui';
import { ButtonSpinner } from './Button';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required accessible name. Also used as the tooltip. */
  label: string;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ControlSize;
  loading?: boolean;
  /** Icon (already sized, e.g. `<X size={ICON_SIZE.md} />`). */
  children: ReactNode;
}

/** Square, round, icon-only button. Defaults to the ghost variant. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', tone, size = 'md', loading = false, disabled, className, children, type = 'button', title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, tone, size, iconOnly: true }), className)}
      {...rest}
    >
      {loading ? <ButtonSpinner /> : children}
    </button>
  );
});
