// Native OS notifications (Telegram-style). In the Electron desktop shell these
// render as real system toasts even when the window is hidden in the tray; in a
// browser/PWA they use the standard Notification API. Either way we only fire
// them when the app isn't in the foreground, so active users aren't spammed.

let permissionAsked = false;

export type NotifyPermission = NotificationPermission | 'unsupported';

export function getNotifyPermission(): NotifyPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  if (permissionAsked) return Notification.permission;
  permissionAsked = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// True when the window is in the foreground (don't notify in that case).
function appInForeground() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

interface NativeNotice {
  title: string;
  body?: string;
  icon?: string | null;
  /** SPA path to open when the notification is clicked. */
  navigateTo?: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
}

function showWindowNotification({ title, body, icon, navigateTo, tag }: NativeNotice) {
  const notification = new Notification(title, {
    body: body || undefined,
    icon: icon || undefined,
    tag,
  });

  notification.onclick = () => {
    if (window.murmurDesktop?.focus) window.murmurDesktop.focus();
    else window.focus();
    if (navigateTo) {
      window.dispatchEvent(new CustomEvent('murmur:navigate', { detail: navigateTo }));
    }
    notification.close();
  };
}

export async function showNativeNotification(notice: NativeNotice) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (appInForeground()) return;

    // Electron supports clickable window notifications directly. Mobile PWAs
    // require ServiceWorkerRegistration.showNotification instead.
    if (window.murmurDesktop?.isDesktop || !('serviceWorker' in navigator)) {
      showWindowNotification(notice);
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(notice.title, {
        body: notice.body || undefined,
        icon: notice.icon || undefined,
        tag: notice.tag,
        data: { navigateTo: notice.navigateTo || '/' },
      });
      return;
    }

    showWindowNotification(notice);
  } catch {
    /* ignore notification failures */
  }
}
