import crypto from 'crypto';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { db } from '../config/db';
import { ApiError } from '../utils/apiError';

/* ────────────────────────── helpers ────────────────────────── */

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mailConfigured() {
  const webhook = Boolean(env.mail.webhookUrl && env.mail.webhookToken);
  const smtp = Boolean(env.mail.user && env.mail.pass && env.mail.from);
  return webhook || smtp;
}

/* ───────────────── unsubscribe tokens (HMAC-signed) ─────────────────
 * The link carries the address and a signature so it cannot be forged to
 * unsubscribe somebody else, and needs no login (CAN-SPAM / GDPR / RFC 8058).
 */
function unsubSecret() {
  return env.unsubscribeSecret || env.jwt.refreshSecret;
}

export function signUnsubscribe(email: string) {
  return crypto.createHmac('sha256', unsubSecret()).update(email.toLowerCase()).digest('hex');
}

export function verifyUnsubscribe(email: string, token: string) {
  const expected = Buffer.from(signUnsubscribe(email));
  const given = Buffer.from(token || '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function unsubscribeUrl(email: string) {
  const e = Buffer.from(email.toLowerCase()).toString('base64url');
  return `${env.apiUrl}/api/email/unsubscribe?e=${e}&t=${signUnsubscribe(email)}`;
}

export async function isSuppressed(email: string) {
  const row = await db.emailSuppression.findUnique({ where: { email: email.toLowerCase() } });
  return Boolean(row);
}

export async function suppress(email: string, reason = 'unsubscribe') {
  const address = email.toLowerCase();
  const existing = await db.emailSuppression.findUnique({ where: { email: address } });
  if (!existing) {
    await db.emailSuppression.create({ data: { email: address, reason } });
  }
  // Keep the user's own preference flag in step with the suppression list.
  await db.user.updateMany({ where: { email: address }, data: { marketingOptIn: false } });
}

export async function resubscribe(email: string) {
  await db.emailSuppression.deleteMany({ where: { email: email.toLowerCase() } });
}

/* ───────────────────────── templating ───────────────────────── */

type Kind = 'transactional' | 'marketing';

function footerText(to: string, kind: Kind) {
  const l = env.legal;
  const lines = [
    '',
    '--',
    kind === 'transactional'
      ? `You are receiving this security/account email because it was requested for ${to} on ${l.appName}.`
      : `You are receiving this email because you opted in to updates from ${l.appName}.`,
    kind === 'transactional'
      ? `Unsubscribe from non-essential emails (codes you request yourself are always delivered): ${unsubscribeUrl(to)}`
      : `Unsubscribe: ${unsubscribeUrl(to)}`,
    l.supportEmail ? `Questions or not you? Contact ${l.supportEmail}` : '',
    [l.entityName, l.postalAddress].filter(Boolean).join(', '),
  ];
  return lines.filter((x) => x !== '').join('\n');
}

function wrapHtml(title: string, bodyHtml: string, to: string, kind: Kind) {
  const l = env.legal;
  const reason =
    kind === 'transactional'
      ? `You are receiving this security/account email because it was requested for <b>${esc(to)}</b> on ${esc(l.appName)}.`
      : `You are receiving this email because you opted in to updates from ${esc(l.appName)}.`;
  const unsub = unsubscribeUrl(to);
  const note =
    kind === 'transactional'
      ? ' Codes you request yourself (verification, password reset) are always delivered.'
      : '';
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:12px;padding:28px">
    <div style="font-size:22px;font-weight:700;color:#e11d48;margin-bottom:16px">${esc(l.appName)}</div>
    <h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>
    ${bodyHtml}
  </div>
  <div style="max-width:520px;margin:14px auto 0;font-size:12px;line-height:18px;color:#64748b;text-align:center">
    <p style="margin:0 0 6px">${reason}</p>
    <p style="margin:0 0 6px"><a href="${esc(unsub)}" style="color:#64748b">Unsubscribe</a> from non-essential emails.${note}</p>
    ${l.supportEmail ? `<p style="margin:0 0 6px">Questions, or this wasn't you? <a href="mailto:${esc(l.supportEmail)}" style="color:#64748b">${esc(l.supportEmail)}</a></p>` : ''}
    <p style="margin:0">${esc([l.entityName, l.postalAddress].filter(Boolean).join(', '))}</p>
  </div></body></html>`;
}

/* ───────────────────────── transport ───────────────────────── */

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: { user: env.mail.user, pass: env.mail.pass },
      pool: true,
      maxConnections: 3,
    });
  }
  return transport;
}

interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function deliver(mail: OutgoingMail, headers: Record<string, string>) {
  if (env.mail.webhookUrl && env.mail.webhookToken) {
    const response = await fetch(env.mail.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.mail.webhookToken, ...mail, headers }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !body?.ok) throw new Error(body?.error || `Mail webhook returned ${response.status}`);
    return;
  }
  await getTransport().sendMail({
    from: { name: env.legal.appName, address: env.mail.from },
    replyTo: env.legal.supportEmail || undefined,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    headers,
  });
}

/**
 * Sends one email with the legally expected headers + footer.
 * `transactional` mail (OTP codes, security notices) is sent even to addresses
 * on the suppression list because the person just asked for it; `marketing`
 * mail is never sent to a suppressed address.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  title: string;
  text: string;
  bodyHtml: string;
  kind?: Kind;
}) {
  const kind = opts.kind ?? 'transactional';
  const to = opts.to.toLowerCase();

  if (kind === 'marketing' && (await isSuppressed(to))) return { skipped: true as const };

  if (!mailConfigured()) {
    if (!env.isProd && env.logOtpToConsole) {
      // eslint-disable-next-line no-console
      console.log(`\n[mail:dev] To: ${to}\nSubject: ${opts.subject}\n${opts.text}\n`);
      return { skipped: false as const };
    }
    throw new ApiError(503, 'Email delivery is temporarily unavailable');
  }

  const unsub = unsubscribeUrl(to);
  const headers: Record<string, string> = {
    'List-Unsubscribe': `<${unsub}>${env.legal.supportEmail ? `, <mailto:${env.legal.supportEmail}?subject=unsubscribe>` : ''}`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
    // Marks automated security mail so mailbox providers do not treat it as bulk.
    ...(kind === 'transactional' ? { 'Auto-Submitted': 'auto-generated' } : {}),
  };

  await deliver(
    {
      to,
      subject: opts.subject,
      text: `${opts.text}\n${footerText(to, kind)}`,
      html: wrapHtml(opts.title, opts.bodyHtml, to, kind),
    },
    headers,
  );
  return { skipped: false as const };
}

/* ─────────────────────── OTP email templates ─────────────────────── */

function codeBlock(code: string) {
  return `<div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 20px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;text-align:center;margin:16px 0">${esc(code)}</div>`;
}

export async function sendVerificationCode(to: string, code: string) {
  const mins = env.otp.ttlMinutes;
  await sendMail({
    to,
    subject: `${code} is your ${env.legal.appName} verification code`,
    title: 'Verify your email address',
    text: `Your ${env.legal.appName} verification code is ${code}. It expires in ${mins} minutes. Never share this code with anyone. If you did not create an account, ignore this email.`,
    bodyHtml: `<p style="margin:0 0 8px">Enter this code to verify your email address:</p>${codeBlock(code)}
      <p style="color:#64748b;font-size:14px;margin:0">It expires in ${mins} minutes. We will never ask you for this code. If you did not create an account, you can safely ignore this email.</p>`,
  });
}

export async function sendPasswordResetCode(to: string, code: string) {
  const mins = env.otp.ttlMinutes;
  await sendMail({
    to,
    subject: `${code} is your ${env.legal.appName} password reset code`,
    title: 'Reset your password',
    text: `Your ${env.legal.appName} password reset code is ${code}. It expires in ${mins} minutes. Never share this code with anyone. If you did not request this, ignore this email — your password will not change.`,
    bodyHtml: `<p style="margin:0 0 8px">Use this code to reset your password:</p>${codeBlock(code)}
      <p style="color:#64748b;font-size:14px;margin:0">It expires in ${mins} minutes. We will never ask you for this code. If you did not request a reset, ignore this email — your password will not change.</p>`,
  });
}

export async function sendPasswordChangedNotice(to: string) {
  await sendMail({
    to,
    subject: `Your ${env.legal.appName} password was changed`,
    title: 'Password changed',
    text: `The password for your ${env.legal.appName} account was just changed and all devices were signed out. If this was not you, reset your password immediately and contact ${env.legal.supportEmail || 'support'}.`,
    bodyHtml: `<p style="margin:0 0 8px">The password for your account was just changed and all devices were signed out.</p>
      <p style="color:#64748b;font-size:14px;margin:0">If this was not you, reset your password immediately and contact ${esc(env.legal.supportEmail || 'support')}.</p>`,
  });
}

export async function sendAccountDeletionCode(to: string, code: string) {
  const mins = env.otp.ttlMinutes;
  await sendMail({
    to,
    subject: `${code} is your ${env.legal.appName} account deletion code`,
    title: 'Confirm account deletion',
    text: `Your ${env.legal.appName} account deletion code is ${code}. It expires in ${mins} minutes. Deleting your account is permanent. If you did not request this, ignore this email and change your password.`,
    bodyHtml: `<p style="margin:0 0 8px">Use this code to confirm permanent deletion of your account:</p>${codeBlock(code)}
      <p style="color:#64748b;font-size:14px;margin:0">It expires in ${mins} minutes. If you did not request this, ignore this email and change your password.</p>`,
  });
}

export async function sendAccountDeletedNotice(to: string) {
  await sendMail({
    to,
    subject: `Your ${env.legal.appName} account was deleted`,
    title: 'Account deleted',
    text: `Your ${env.legal.appName} account and its personal data have been deleted. If this was not you, contact ${env.legal.supportEmail || 'support'} immediately.`,
    bodyHtml: `<p style="margin:0">Your account and its personal data have been deleted. If this was not you, contact ${esc(env.legal.supportEmail || 'support')} immediately.</p>`,
  });
}
