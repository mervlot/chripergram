/**
 * Progressive enhancements that live outside React so they can be wired up
 * with a single import from main.tsx (keeping App/Layout untouched):
 *   1. PWA — registers the service worker (production only) and injects the
 *      manifest + theme-color/apple meta tags so Chirpergram is installable.
 *   2. Power-user keyboard shortcuts with a "?" help overlay.
 */

// ─────────────────────────── PWA ───────────────────────────

function injectHeadTags() {
  const head = document.head;
  const ensure = (selector: string, create: () => HTMLElement) => {
    if (!head.querySelector(selector)) head.appendChild(create());
  };

  ensure('link[rel="manifest"]', () => {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.json';
    return link;
  });
  ensure('meta[name="theme-color"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#07090b';
    return meta;
  });
  ensure('link[rel="apple-touch-icon"]', () => {
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = '/icon.svg';
    return link;
  });
  ensure('meta[name="apple-mobile-web-app-capable"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-capable';
    meta.content = 'yes';
    return meta;
  });
  ensure('meta[name="mobile-web-app-capable"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'mobile-web-app-capable';
    meta.content = 'yes';
    return meta;
  });
  ensure('meta[name="apple-mobile-web-app-title"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-title';
    meta.content = 'Chirpergram';
    return meta;
  });
  ensure('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-status-bar-style';
    meta.content = 'black';
    return meta;
  });
}

// Flag installed-PWA / desktop launches so the CSS can intensify the glass
// look (see `.standalone` in index.css).
function applyStandaloneClass() {
  const mql = window.matchMedia?.('(display-mode: standalone)');
  const update = () => {
    const standalone =
      !!mql?.matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      !!(window as unknown as { murmurDesktop?: { isDesktop?: boolean } }).murmurDesktop?.isDesktop;
    document.documentElement.classList.toggle('standalone', standalone);
  };
  update();
  mql?.addEventListener?.('change', update);
}

function registerServiceWorker() {
  // Only in production — a SW would interfere with the Vite dev server's HMR.
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}

// ─────────────────────── Keyboard shortcuts ───────────────────────

const ROUTES: Record<string, string> = {
  h: '/home',
  e: '/explore',
  n: '/notifications',
  m: '/messages',
  b: '/bookmarks',
  c: '/communities',
  s: '/settings',
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.getAttribute('role') === 'textbox'
  );
}

// React Router (v6) listens for popstate; pushing state and dispatching the
// event makes it pick up the new location without a full page reload.
function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Search"]');
  if (input) {
    input.focus();
    input.select();
    return true;
  }
  navigate('/search');
  return false;
}

const SHORTCUTS: Array<[string, string]> = [
  ['g h', 'Go to Home'],
  ['g e', 'Go to Explore'],
  ['g n', 'Go to Notifications'],
  ['g m', 'Go to Messages'],
  ['g b', 'Go to Bookmarks'],
  ['g c', 'Go to Communities'],
  ['g s', 'Go to Settings'],
  ['/', 'Focus search'],
  ['?', 'Toggle this help'],
];

let overlay: HTMLElement | null = null;

function buildOverlay(): HTMLElement {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Keyboard shortcuts');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(2,6,23,0.55)',
    backdropFilter: 'blur(2px)',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    width: 'min(420px, calc(100vw - 32px))',
    borderRadius: '20px',
    padding: '20px 22px',
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)',
    background: dark ? '#0b0d16' : '#ffffff',
    color: dark ? '#e2e8f0' : '#0f172a',
    border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as CSSStyleDeclaration);

  const title = document.createElement('h2');
  title.textContent = 'Keyboard shortcuts';
  Object.assign(title.style, { margin: '0 0 14px', fontSize: '18px', fontWeight: '800' } as CSSStyleDeclaration);
  card.appendChild(title);

  for (const [keys, label] of SHORTCUTS) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 0',
    } as CSSStyleDeclaration);

    const text = document.createElement('span');
    text.textContent = label;
    text.style.fontSize = '14px';

    const kbds = document.createElement('span');
    keys.split(' ').forEach((k) => {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      Object.assign(kbd.style, {
        display: 'inline-block',
        minWidth: '20px',
        textAlign: 'center',
        margin: '0 2px',
        padding: '2px 7px',
        borderRadius: '7px',
        fontSize: '12px',
        fontWeight: '700',
        background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
        border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.12)',
      } as CSSStyleDeclaration);
      kbds.appendChild(kbd);
    });

    row.appendChild(text);
    row.appendChild(kbds);
    card.appendChild(row);
  }

  const hint = document.createElement('p');
  hint.textContent = 'Tip: press g then a letter. Esc closes this.';
  Object.assign(hint.style, { margin: '14px 0 0', fontSize: '12px', opacity: '0.6' } as CSSStyleDeclaration);
  card.appendChild(hint);

  root.appendChild(card);
  root.addEventListener('click', (e) => {
    if (e.target === root) toggleOverlay(false);
  });
  return root;
}

function toggleOverlay(force?: boolean) {
  const show = force ?? !overlay;
  if (show && !overlay) {
    overlay = buildOverlay();
    document.body.appendChild(overlay);
  } else if (!show && overlay) {
    overlay.remove();
    overlay = null;
  }
}

function installShortcuts() {
  let awaitingG = false;
  let gTimer: number | undefined;

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Escape' && overlay) {
      toggleOverlay(false);
      return;
    }
    if (isTypingTarget(e.target)) return;

    if (e.key === '?') {
      e.preventDefault();
      toggleOverlay();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      focusSearch();
      return;
    }

    if (awaitingG) {
      awaitingG = false;
      window.clearTimeout(gTimer);
      const dest = ROUTES[e.key.toLowerCase()];
      if (dest) {
        e.preventDefault();
        navigate(dest);
      }
      return;
    }

    if (e.key === 'g') {
      awaitingG = true;
      gTimer = window.setTimeout(() => {
        awaitingG = false;
      }, 1200);
    }
  });
}

// ─────────────────────── Offline indicator ───────────────────────

function installOfflineBanner() {
  let banner: HTMLElement | null = null;

  const show = () => {
    if (banner) return;
    banner = document.createElement('div');
    banner.textContent = "You're offline — changes will sync when you reconnect.";
    Object.assign(banner.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '9998',
      padding: '10px 16px',
      textAlign: 'center',
      fontSize: '13px',
      fontWeight: '700',
      color: '#ffffff',
      background: '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    } as CSSStyleDeclaration);
    document.body.appendChild(banner);
  };
  const hide = () => {
    banner?.remove();
    banner = null;
  };

  window.addEventListener('offline', show);
  window.addEventListener('online', hide);
  if (!navigator.onLine) show();
}

// ─────────────────────────── Bootstrap ───────────────────────────

injectHeadTags();
applyStandaloneClass();
registerServiceWorker();
installShortcuts();
installOfflineBanner();
