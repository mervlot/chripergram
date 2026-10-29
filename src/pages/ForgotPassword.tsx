import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { buttonClass } from '../lib/ui';

export function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ message: string; code: string | null }>('/auth/forgot-password', {
        identifier,
      });
      setMessage(data.message);
      setDevCode(data.code);
      if (!data.code) {
        navigate(`/reset-password?identifier=${encodeURIComponent(identifier)}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-black px-5 py-10">
      <div className="w-full max-w-[400px]">
        <h1 className="mb-2 text-[1.75rem] font-extrabold tracking-tight text-white">Reset your password</h1>
        <p className="mb-6 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Enter your email or username. We'll send a 6-digit code to your account email.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            className="auth-input"
            placeholder="Email or username"
            aria-label="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
          {error && (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          <button className={buttonClass({ variant: 'primary', size: 'lg', fullWidth: true })} disabled={busy}>
            {busy ? 'Sending...' : 'Send code'}
          </button>
        </form>

        {message && <p className="mt-4 text-sm font-medium text-green-600 dark:text-green-400">{message}</p>}
        {devCode && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            <p className="mb-1 font-semibold">Dev mode code: {devCode}</p>
            <Link
              to={`/reset-password?identifier=${encodeURIComponent(identifier)}&code=${devCode}`}
              className="font-medium text-brand hover:underline"
            >
              Continue
            </Link>
          </div>
        )}

        <p className="mt-6 text-sm">
          <Link to="/login" className="font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
