import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { errorMessage } from '../lib/api';
import { GoogleAuthButton } from '../components/GoogleAuthButton';
import { useT } from '../lib/i18n';
import { AuthDivider, AuthLayout, Field } from '../components/AuthLayout';
import { buttonClass } from '../lib/ui';

export function Login() {
  const t = useT();
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const googleStatus = new URLSearchParams(location.search).get('google');
    if (googleStatus === 'not-configured') setError('Google sign-in is not configured yet.');
    if (googleStatus === 'failed') setError('Could not sign in with Google. Please try again.');
  }, [location.search]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(identifier, password);
      navigate(from ?? '/home', { replace: true });
    } catch (err) {
      const details = (err as { response?: { data?: { error?: { details?: { code?: string; email?: string } } } } })
        ?.response?.data?.error?.details;
      if (details?.code === 'EMAIL_NOT_VERIFIED') {
        navigate(`/verify-email?email=${encodeURIComponent(details.email ?? identifier)}`, { state: { fresh: true } });
        return;
      }
      setError(errorMessage(err, 'Invalid credentials'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Your corner of the internet."
      footer={
        <>
          New to Chirpergram?{' '}
          <Link to="/register" className="font-semibold text-white hover:text-brand">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleAuthButton />
      <AuthDivider />

      <form onSubmit={submit} className="space-y-4">
        <Field label={t('emailOrUsername')}>
          <input
            id="identifier"
            className="auth-input"
            placeholder="Enter your email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </Field>

        <Field
          label={t('password')}
          aside={
            <Link to="/forgot-password" className="text-xs font-medium text-brand hover:underline">
              {t('forgotPassword')}
            </Link>
          }
        >
          <input
            id="password"
            className="auth-input"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <div role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-3 text-sm font-medium text-red-400">
            {error}
          </div>
        )}

        <button type="submit" className={buttonClass({ variant: 'primary', size: 'lg', fullWidth: true })} disabled={busy}>
          {busy ? t('signingIn') : t('signIn')}
        </button>
      </form>
    </AuthLayout>
  );
}
