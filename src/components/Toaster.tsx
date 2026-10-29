import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToast, ToastType } from '../store/toast';
import { GlassPanel, IconButton } from './ui';

const STYLES: Record<ToastType, { icon: typeof Info; ring: string }> = {
  success: { icon: CheckCircle2, ring: 'text-green-500' },
  error: { icon: AlertCircle, ring: 'text-red-500' },
  info: { icon: Info, ring: 'text-brand' },
};

// Fixed, animated toast stack shown above the mobile nav.
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((t) => {
        const { icon: Icon, ring } = STYLES[t.type];
        return (
          <GlassPanel
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-center gap-3 py-2 pl-4 pr-2"
          >
            <Icon size={20} className={`shrink-0 ${ring}`} />
            <p className="flex-1 text-sm font-medium text-white">{t.message}</p>
            <IconButton label="Dismiss notification" size="sm" onClick={() => dismiss(t.id)}>
              <X size={16} />
            </IconButton>
          </GlassPanel>
        );
      })}
    </div>
  );
}
