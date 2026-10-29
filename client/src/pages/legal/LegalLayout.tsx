import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Feather } from 'lucide-react';
import { LEGAL } from '../../lib/legal';

export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/cookies', label: 'Cookies & Storage' },
  { to: '/acceptable-use', label: 'Acceptable Use & Copyright' },
];

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#07090b] px-5 py-[max(2rem,env(safe-area-inset-top))] text-stone-300">
      <div className="mx-auto w-full max-w-3xl">
        <Link to="/" className="mb-8 flex items-center gap-2.5">
          <Feather size={26} strokeWidth={2.4} className="text-brand" />
          <span className="text-xl font-bold tracking-tight text-white">{LEGAL.appName}</span>
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">
          Version {LEGAL.version} · Effective {LEGAL.effective}
        </p>
        <div className="mt-8 space-y-8 text-[15px] leading-7">{children}</div>

        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-sm">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="text-stone-400 hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mb-10 mt-4 text-xs text-stone-600">
          {LEGAL.entity} · {LEGAL.address}
        </p>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold text-white">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-6 marker:text-stone-600">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-stone-200">{children}</div>;
}

export function Mail({ to }: { to: string }) {
  return (
    <a href={`mailto:${to}`} className="font-medium text-brand hover:underline">
      {to}
    </a>
  );
}
