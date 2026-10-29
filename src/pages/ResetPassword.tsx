import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { buttonClass } from '../lib/ui';

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState(params.get('identifier') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { identifier, code, password });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-black px-5 py-10">
      <div className="w-full max-w-[400px]">
        <h1 className="mb-2 text-[1.75rem] font-extrabold tracking-tight text-white">Choose a new password</h1>
        <p className="mb-6 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Enter the code from your email and choose a new password.
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
          <input
            className="auth-input text-center text-xl font-semibold tabular-nums"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            aria-label="6-digit reset code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="New password (min 8 characters)"
            aria-label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          <button className={buttonClass({ variant: 'primary', size: 'lg', fullWidth: true })} disabled={busy}>
            {busy ? 'Updating...' : 'Reset password'}
          </button>
        </form>
        <p className="mt-6 text-sm">
          <Link to="/login" className="font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
