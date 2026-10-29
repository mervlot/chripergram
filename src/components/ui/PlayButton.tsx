import { forwardRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { ButtonVariant, ControlSize, ICON_SIZE } from '../../lib/ui';
import { IconButton, IconButtonProps } from './IconButton';

interface Props extends Omit<IconButtonProps, 'label' | 'children' | 'variant' | 'size'> {
  playing?: boolean;
  /** What is being played, e.g. "voice message". */
  subject?: string;
  variant?: ButtonVariant;
  size?: ControlSize;
}

/** Play/pause toggle for every media control. Glass by default (it sits over media). */
export const PlayButton = forwardRef<HTMLButtonElement, Props>(function PlayButton(
  { playing = false, subject, variant = 'glass', size = 'md', ...rest },
  ref,
) {
  const label = `${playing ? 'Pause' : 'Play'}${subject ? ` ${subject}` : ''}`;
  return (
    <IconButton ref={ref} label={label} variant={variant} size={size} aria-pressed={playing} {...rest}>
      {playing ? (
        <Pause size={ICON_SIZE.md} fill="currentColor" />
      ) : (
        <Play size={ICON_SIZE.md} fill="currentColor" className="ml-0.5" />
      )}
    </IconButton>
  );
});

/** Pause-state convenience wrapper. */
export const PauseButton = forwardRef<HTMLButtonElement, Omit<Props, 'playing'>>(function PauseButton(props, ref) {
  return <PlayButton ref={ref} playing {...props} />;
});
