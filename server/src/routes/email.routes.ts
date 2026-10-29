import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { suppress, resubscribe, verifyUnsubscribe } from '../services/mail.service';
import { otpLimiter } from '../middleware/rateLimit';

const router = Router();

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function decodeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  try {
    const value = Buffer.from(raw, 'base64url').toString('utf8');
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#07090b;color:#e7e5e4;font-family:Arial,Helvetica,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.c{max-width:420px;width:100%}h1{font-size:22px;margin:0 0 10px}p{color:#a8a29e;line-height:1.6;font-size:15px}
button{background:#e11d48;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px}
a{color:#fb7185}</style></head><body><div class="c"><h1>${esc(title)}</h1>${body}</div></body></html>`;
}

// GET only shows a confirmation button. Mail scanners and link previewers
// follow GET links automatically, so changing state here would unsubscribe
// people who never clicked anything.
router.get('/unsubscribe', (req: Request, res: Response) => {
  const email = decodeEmail(req.query.e);
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  if (!email || !verifyUnsubscribe(email, token)) {
    res.status(400).type('html').send(page('Invalid link', '<p>This unsubscribe link is invalid or has been altered.</p>'));
    return;
  }
  res.type('html').send(
    page(
      'Unsubscribe',
      `<p>Stop non-essential emails from ${esc(env.legal.appName)} to <b>${esc(email)}</b>?</p>
       <p>Security emails you request yourself (verification and password-reset codes) will still be delivered, because you cannot use your account securely without them.</p>
       <form method="post" action="/api/email/unsubscribe?e=${esc(String(req.query.e))}&t=${esc(token)}"><button type="submit">Unsubscribe</button></form>`,
    ),
  );
});

// POST performs the change. Also serves RFC 8058 one-click unsubscribe, which
// mail clients send as a POST with "List-Unsubscribe=One-Click".
router.post(
  '/unsubscribe',
  otpLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const email = decodeEmail(req.query.e);
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    if (!email || !verifyUnsubscribe(email, token)) {
      res.status(400).type('html').send(page('Invalid link', '<p>This unsubscribe link is invalid or has been altered.</p>'));
      return;
    }
    await suppress(email, 'unsubscribe');
    res.type('html').send(
      page(
        "You're unsubscribed",
        `<p><b>${esc(email)}</b> will no longer receive non-essential emails from ${esc(env.legal.appName)}.</p>
         <form method="post" action="/api/email/resubscribe?e=${esc(String(req.query.e))}&t=${esc(token)}"><button type="submit" style="background:#292524">Undo</button></form>`,
      ),
    );
  }),
);

router.post(
  '/resubscribe',
  otpLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const email = decodeEmail(req.query.e);
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    if (!email || !verifyUnsubscribe(email, token)) {
      res.status(400).type('html').send(page('Invalid link', '<p>This link is invalid or has been altered.</p>'));
      return;
    }
    await resubscribe(email);
    res.type('html').send(page('Preference restored', `<p>You are subscribed again.</p>`));
  }),
);

export default router;
