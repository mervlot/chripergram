import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Camera, Monitor, Smartphone, ShieldCheck, LogOut, Loader2, Mic, Video, Gamepad2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';
import { LOCALES, useLocale, useT } from '../lib/i18n';
import { useDevices } from '../store/devices';
import { soundsMuted, setSoundsMuted } from '../lib/sound';
import { playMessageSound } from '../lib/sound';
import { getNotifyPermission, requestNotifyPermission, type NotifyPermission } from '../lib/notify';
import { relativeTime } from '../lib/format';
import {
  isDesktopApp,
  isGameTrackingEnabled,
  setGameTrackingEnabled,
} from '../lib/desktop';
import { openMediaSettings } from '../lib/mediaAccess';
import { PageHeader } from '../components/PageHeader';
import type { AuthUser, Session } from '../types';
import { buttonClass, cn, ICON_SIZE } from '../lib/ui';
import { IconButton } from '../components/ui';

export function Settings() {
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const tr = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const googleWelcome = new URLSearchParams(location.search).get('welcome') === 'google';

  const [form, setForm] = useState({
    displayName: user.displayName,
    bio: user.bio ?? '',
    link: user.link ?? '',
    location: user.location ?? '',
    gameStatus: user.gameStatus ?? '',
  });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl);
  const [bannerPreview, setBannerPreview] = useState(user.bannerUrl);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(soundsMuted());
  const [notifyPermission, setNotifyPermission] = useState<NotifyPermission>(getNotifyPermission);
  const [autoGameActivity, setAutoGameActivity] = useState(isGameTrackingEnabled);

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSavedMsg('');
    try {
      const data = new FormData();
      data.append('displayName', form.displayName);
      data.append('bio', form.bio);
      data.append('link', form.link);
      data.append('location', form.location);
      data.append('gameStatus', form.gameStatus);
      if (avatar) data.append('avatar', avatar);
      if (banner) data.append('banner', banner);

      const { data: res } = await api.patch<{ user: AuthUser }>('/users/profile', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.user);
      queryClient.invalidateQueries({ queryKey: ['profile', user.username] });
      setSavedMsg('Profile saved.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save profile'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" back />

      {googleWelcome && (
        <section className="card bg-brand/5 p-4">
          <h2 className="font-semibold">Google sign-in is ready</h2>
          <p className="mt-1 text-sm text-gray-500">
            Your profile was created from Google. You can adjust your name and avatar here.
          </p>
        </section>
      )}

      <form onSubmit={saveProfile} className="card pb-6">
        <div className="relative h-40 bg-gradient-to-br from-violet-100 via-white to-blue-100 dark:from-white/[0.08] dark:via-white/[0.03] dark:to-blue-500/10">
          {bannerPreview && <img src={bannerPreview} className="h-full w-full object-cover" />}
          <IconButton
            label="Change banner"
            variant="glass"
            size="lg"
            onClick={() => bannerInput.current?.click()}
            className="absolute inset-0 m-auto"
          >
            <Camera size={ICON_SIZE.md} />
          </IconButton>
          <input
            ref={bannerInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setBanner(f);
                setBannerPreview(URL.createObjectURL(f));
              }
            }}
          />
        </div>

        <div className="px-4">
          <div className="relative -mt-12 mb-4 h-24 w-24">
            <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-slate-200 dark:border-[#0a0a0c] dark:bg-slate-800">
              {avatarPreview && <img src={avatarPreview} className="h-full w-full object-cover" />}
            </div>
            <IconButton
              label="Change avatar"
              variant="glass"
              onClick={() => avatarInput.current?.click()}
              className="absolute inset-0 m-auto"
            >
              <Camera size={ICON_SIZE.md} />
            </IconButton>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAvatar(f);
                  setAvatarPreview(URL.createObjectURL(f));
                }
              }}
            />
          </div>

          <div className="space-y-4">
            <Field label="Name">
              <input
                className="input"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                maxLength={50}
              />
            </Field>
            <Field label="Bio">
              <textarea
                className="input resize-none"
                rows={3}
                value={form.bio}
                maxLength={160}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
            <Field label="Location">
              <input
                className="input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                maxLength={50}
              />
            </Field>
            <Field label="Playing now">
              <input
                className="input"
                placeholder="e.g. Valorant — Ranked"
                value={form.gameStatus}
                onChange={(e) => setForm({ ...form, gameStatus: e.target.value })}
                maxLength={60}
              />
            </Field>
            <Field label="Website">
              <input
                className="input"
                placeholder="https://"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </Field>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          {savedMsg && <p className="mt-3 text-sm text-green-600">{savedMsg}</p>}
          <button className={cn(buttonClass({ variant: 'primary' }), 'mt-4')} disabled={busy}>
            {busy ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </form>

      {/* Interface language */}
      <section className="card p-4">
        <h2 className="mb-1 text-lg font-semibold">{tr('language')}</h2>
        <p className="mb-3 text-sm text-gray-500">{tr('languageDesc')}</p>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
                locale === l.code
                  ? 'border border-brand/60 bg-stone-900 text-brand'
                  : 'bg-black/[0.04] text-slate-600 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section className="card p-4">
        <h2 className="mb-3 text-lg font-semibold">Notifications</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Message sounds</p>
            <p className="text-sm text-gray-500">Play a chime when a new direct message arrives.</p>
          </div>
          <button
            role="switch"
            aria-checked={!muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setSoundsMuted(next);
              if (!next) playMessageSound(); // preview the sound when enabling
            }}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              muted ? 'bg-gray-300 dark:bg-gray-700' : 'bg-brand'
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                muted ? 'left-1' : 'left-6'
              }`}
            />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200/70 pt-4 dark:border-white/10">
          <div>
            <p className="font-medium">System notifications</p>
            <p className="text-sm text-gray-500">
              {notifyPermission === 'granted'
                ? 'Enabled for messages and social activity.'
                : notifyPermission === 'denied'
                  ? 'Blocked in browser settings.'
                  : notifyPermission === 'unsupported'
                    ? 'Not supported by this browser.'
                    : 'Show alerts while Chirpergram is in the background.'}
            </p>
          </div>
          {notifyPermission === 'default' && (
            <button
              type="button"
              onClick={async () => setNotifyPermission(await requestNotifyPermission())}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <Bell size={16} />
              Enable
            </button>
          )}
        </div>
      </section>

      <CallDevices />

      {isDesktopApp() && (
        <section className="card p-4">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Gamepad2 size={20} /> Game activity
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Show the game you are playing</p>
              <p className="text-sm text-gray-500">
                Chirpergram checks running process names on this PC and shares only the detected game title.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoGameActivity}
              onClick={() => {
                const next = !autoGameActivity;
                setAutoGameActivity(next);
                setGameTrackingEnabled(next);
              }}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                autoGameActivity ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                  autoGameActivity ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>
      )}

      {user.googleLinked && (
        <section className="card p-4">
          <h2 className="mb-1 text-lg font-semibold">Google sign-in</h2>
          <p className="text-sm text-gray-500">
            Connected to your Google account. You can sign in without a password.
          </p>
        </section>
      )}

      <ChangePassword />

      <ActiveSessions />

      <section className="p-4">
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className={buttonClass({ variant: 'destructive', fullWidth: true })}
        >
          Log out
        </button>
      </section>
    </div>
  );
}

// Call device selection — detects the microphones/cameras present on this PC
// and lets the user choose which ones calls should use (persisted).
function CallDevices() {
  const { mics, cams, micId, camId, permission, error, settingsKind, setMic, setCam, refresh } = useDevices();
  const [loading, setLoading] = useState(false);

  async function detect() {
    setLoading(true);
    await refresh();
    setLoading(false);
  }

  const detected = mics.length > 0 || cams.length > 0;

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">Calls &amp; devices</h2>
      <p className="mb-3 text-sm text-gray-500">
        Choose the microphone and camera used for voice and video calls.
      </p>

      {!detected ? (
        <div className="space-y-2">
          <button onClick={detect} disabled={loading} className={buttonClass({ variant: 'primary' })}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
            {loading ? 'Detecting…' : 'Detect my devices'}
          </button>
          {permission === 'denied' && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-red-500">{error || 'Microphone/camera access was blocked.'}</p>
              {settingsKind && (
                <button
                  type="button"
                  onClick={() => openMediaSettings(settingsKind)}
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                >
                  Open system settings
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm text-gray-500">
              <Mic size={14} /> Microphone
            </span>
            <select
              className="input"
              value={micId ?? ''}
              onChange={(e) => setMic(e.target.value || null)}
            >
              <option value="">System default</option>
              {mics.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </label>

          {cams.length > 0 && (
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm text-gray-500">
                <Video size={14} /> Camera
              </span>
              <select
                className="input"
                value={camId ?? ''}
                onChange={(e) => setCam(e.target.value || null)}
              >
                <option value="">System default</option>
                {cams.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button onClick={detect} disabled={loading} className={buttonClass({ variant: 'secondary' })}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Refresh device list
          </button>
        </div>
      )}
    </section>
  );
}

// Friendly "Chrome on Windows" style label from a raw user-agent string.
function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg/.test(ua)
    ? 'Edge'
    : /OPR|Opera/.test(ua)
      ? 'Opera'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Firefox/.test(ua)
          ? 'Firefox'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

function isMobileUA(ua: string | null): boolean {
  return !!ua && /Mobile|Android|iPhone|iPad/.test(ua);
}

// Lists the account's active login sessions and lets the user revoke them —
// a key account-security control (paired with server-side token rotation).
function ActiveSessions() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await api.get<{ sessions: Session[] }>('/auth/sessions')).data.sessions,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      await refresh();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    setBusyId('others');
    try {
      await api.delete('/auth/sessions/others');
      await refresh();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  }

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">Active sessions</h2>
      <p className="mb-3 text-sm text-gray-500">
        Devices currently signed in to your account. Revoke any you don&apos;t recognise.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> Loading sessions…
        </div>
      )}

      <ul className="space-y-2">
        {(sessions ?? []).map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-2xl border border-slate-200/80 p-3 dark:border-white/10"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
              {isMobileUA(s.userAgent) ? <Smartphone size={18} /> : <Monitor size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-semibold">
                {describeDevice(s.userAgent)}
                {s.current && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">
                    <ShieldCheck size={12} /> This device
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-gray-500">
                {s.ip ? `${s.ip} · ` : ''}active {relativeTime(s.lastUsedAt)}
              </p>
            </div>
            {!s.current && (
              <button
                onClick={() => revoke(s.id)}
                disabled={busyId === s.id}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                {busyId === s.id ? '…' : 'Revoke'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {others > 0 && (
        <button
          onClick={revokeOthers}
          disabled={busyId === 'others'}
          className={cn(buttonClass({ variant: 'destructive' }), 'mt-3')}
        >
          <LogOut size={16} />
          {busyId === 'others' ? 'Signing out…' : 'Log out of all other devices'}
        </button>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ChangePassword() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const hasPassword = user?.hasPassword ?? true;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await api.post('/auth/change-password', {
        currentPassword: hasPassword ? current : undefined,
        newPassword: next,
      });
      if (user && !hasPassword) setUser({ ...user, hasPassword: true });
      setMsg(hasPassword ? 'Password changed.' : 'Password added.');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">{hasPassword ? 'Change password' : 'Set password'}</h2>
      {!hasPassword && (
        <p className="mb-3 text-sm text-gray-500">
          Optional: add a password if you also want to sign in without Google.
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        {hasPassword && (
          <input
            className="input"
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        )}
        <input
          className="input"
          type="password"
          placeholder="New password (min 8)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        <button className={buttonClass({ variant: 'primary' })} disabled={busy || !next || (hasPassword && !current)}>
          {busy ? 'Updating...' : hasPassword ? 'Update password' : 'Add password'}
        </button>
      </form>
    </section>
  );
}
