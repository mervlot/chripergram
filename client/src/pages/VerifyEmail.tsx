import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { api, errorMessage } from '../lib/api';
import { AuthLayout, Field } from '../components/AuthLayout';
import { buttonClass } from '../lib/ui';

const COOLDOWN = 60;

export function VerifyEmail() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const verifyEmail = useAuth((s) => s.verifyEmail);
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // A code was just sent when we arrive here, so start with a cooldown.
  const [cooldown, setCooldown] = useState(COOLDOWN);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await verifyEmail(email, code);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not verify that code'));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    try {
      await api.post('/auth/resend-verification', { email });
      setNotice('A new code is on its way. Check your spam folder too.');
      setCooldown(COOLDOWN);
    } catch (err) {
      setError(errorMessage(err, 'Could not resend the code'));
    }
  }

  if (!email) {
    return (
      <AuthLayout title="Verify your email" footer={<Link to="/login" className="font-semibold text-white hover:text-brand">Back to sign in</Link>}>
        <p className="text-stone-400">Open this page from the sign-up or sign-in screen so we know which email to verify.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={`We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
      footer={
        <>
          Wrong address?{' '}
          <Link to="/register" className="font-semibold text-white hover:text-brand">Start over</Link>
          {' · '}
          <Link to="/login" className="font-semibold text-white hover:text-brand">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Verification code">
          <input
            ref={inputRef}
            className="auth-input text-center text-2xl font-semibold tracking-[0.4em] tabular-nums"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
          />
        </Field>

        {error && (
          <div role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-3 text-sm font-medium text-red-400">{error}</div>
        )}
        {notice && (
          <div role="status" className="rounded-xl bg-emerald-500/10 px-3.5 py-3 text-sm font-medium text-emerald-400">{notice}</div>
        )}

        <button
          type="submit"
          className={buttonClass({ variant: 'primary', size: 'lg', fullWidth: true })}
          disabled={busy || code.length !== 6}
        >
          {busy ? 'Verifying...' : 'Verify and continue'}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="w-full text-center text-sm font-medium text-stone-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </form>
    </AuthLayout>
  );
}
