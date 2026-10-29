import { ReactNode } from 'react';
import { Feather } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Shared shell for every signed-out screen: one solid black canvas (no stripes, no
// borders), content centred, safe-area aware, scrolls cleanly when the keyboard is up.
export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#07090b] px-5 py-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-2.5">
          <Feather size={28} strokeWidth={2.4} className="text-brand" />
          <span className="text-2xl font-bold tracking-tight text-white">Chirpergram</span>
        </div>

        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-stone-400">{subtitle}</p>}

        <div className="mt-7 space-y-5">{children}</div>

        {footer && <div className="mt-7 text-center text-sm text-stone-400">{footer}</div>}

        <nav aria-label="Legal" className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-stone-600">
          <Link to="/terms" className="hover:text-stone-300">Terms</Link>
          <Link to="/privacy" className="hover:text-stone-300">Privacy</Link>
          <Link to="/cookies" className="hover:text-stone-300">Cookies</Link>
          <Link to="/acceptable-use" className="hover:text-stone-300">Acceptable use</Link>
        </nav>
      </div>
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium text-stone-600">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[13px] font-semibold text-stone-300">
        {label}
        {aside}
      </span>
      {children}
    </label>
  );
}
