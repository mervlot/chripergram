import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { errorMessage } from '../lib/api';
import { GoogleAuthButton } from '../components/GoogleAuthButton';
import { AuthDivider, AuthLayout, Field } from '../components/AuthLayout';
import { buttonClass } from '../lib/ui';

export function Register() {
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create account'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Join Chirpergram."
      subtitle="Create your account and join the conversation."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-white hover:text-brand">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleAuthButton label="Sign up with Google" />
      <AuthDivider />

      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            id="displayName"
            className="auth-input"
            placeholder="Enter your name"
            value={form.displayName}
            onChange={update('displayName')}
            autoComplete="name"
            required
          />
        </Field>

        <Field label="Username">
          <input
            id="username"
            className="auth-input"
            placeholder="Choose a username"
            value={form.username}
            onChange={update('username')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </Field>

        <Field label="Email">
          <input
            id="email"
            className="auth-input"
            type="email"
            placeholder="name@example.com"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
        </Field>

        <Field label="Password">
          <input
            id="password"
            className="auth-input"
            type="password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            required
          />
        </Field>

        {error && (
          <div role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-3 text-sm font-medium text-red-400">
            {error}
          </div>
        )}

        <button type="submit" className={buttonClass({ variant: 'primary', size: 'lg', fullWidth: true })} disabled={busy}>
          {busy ? 'Creating...' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
