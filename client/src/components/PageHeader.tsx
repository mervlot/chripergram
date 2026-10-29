import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton, GlassHeader } from './ui';

interface Props {
  title: string;
  subtitle?: string;
  back?: boolean;
  children?: ReactNode;
  right?: ReactNode;
  left?: ReactNode;
  /** Overrides the default "go back in history" behaviour of the back arrow. */
  onBack?: () => void;
}

export function PageHeader({ title, subtitle, back, children, right, left, onBack }: Props) {
  const navigate = useNavigate();

  return (
    <GlassHeader>
      <div className="flex min-h-14 items-center gap-3 px-4 py-2">
        {left}
        {back && <BackButton className="-ml-2" onClick={() => (onBack ? onBack() : navigate(-1))} />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-white sm:text-xl">
            {title}
          </h1>
          {subtitle && <p className="truncate text-xs font-medium text-stone-400">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </GlassHeader>
  );
}
