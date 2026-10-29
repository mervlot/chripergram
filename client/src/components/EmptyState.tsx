import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, subtitle, children }: Props) {
  return (
    <div className="animate-page-enter border-t-2 border-stone-950 px-5 py-9 text-left dark:border-stone-100">
      <div className="flex items-start gap-4">
        {Icon && <Icon size={24} strokeWidth={1.8} className="mt-0.5 shrink-0 text-brand" />}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-stone-950 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-1 max-w-md text-sm leading-6 text-stone-500">{subtitle}</p>}
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </div>
  );
}
