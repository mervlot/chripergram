import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ButtonVariant, ControlSize, ICON_SIZE, cn, iconButtonClass } from '../../lib/ui';
import { IconButton } from './IconButton';

interface Props {
  /** Render as a router link instead of a button. */
  to?: string;
  onClick?: () => void;
  label?: string;
  variant?: ButtonVariant;
  size?: ControlSize;
  className?: string;
}

/** Standard "back" control. Pass `to` for a link, `onClick` for history/callbacks. */
export const BackButton = forwardRef<HTMLButtonElement, Props>(function BackButton(
  { to, onClick, label = 'Go back', variant = 'ghost', size = 'md', className },
  ref,
) {
  const icon = <ArrowLeft size={ICON_SIZE.md} />;
  if (to) {
    return (
      <Link to={to} aria-label={label} title={label} className={cn(iconButtonClass(variant, size), className)}>
        {icon}
      </Link>
    );
  }
  return (
    <IconButton ref={ref} label={label} variant={variant} size={size} onClick={onClick} className={className}>
      {icon}
    </IconButton>
  );
});
