export type MediaAccessKind = 'microphone' | 'camera';
export type MediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export interface MurmurDesktopBridge {
  isDesktop: boolean;
  platform: string;
  focus?: () => void;
  retry?: () => void;
  getGameActivity?: () => Promise<string | null>;
  setGameTrackingEnabled?: (enabled: boolean) => void;
  onGameActivity?: (callback: (game: string | null) => void) => () => void;
  getMediaAccessStatus?: () => Promise<Record<MediaAccessKind, MediaAccessStatus>>;
  requestMediaAccess?: (request: { audio: boolean; video: boolean }) => Promise<Record<MediaAccessKind, MediaAccessStatus>>;
  openMediaSettings?: (kind: MediaAccessKind) => void;
}

declare global {
  interface Window {
    murmurDesktop?: MurmurDesktopBridge;
  }
}

const GAME_TRACKING_KEY = 'murmurGameTracking';
const GAME_TRACKING_EVENT = 'murmur:game-tracking-preference';

export function desktopBridge(): MurmurDesktopBridge | undefined {
  return window.murmurDesktop;
}

export function isDesktopApp(): boolean {
  return Boolean(desktopBridge()?.isDesktop);
}

export function isGameTrackingEnabled(): boolean {
  return localStorage.getItem(GAME_TRACKING_KEY) !== 'false';
}

export function setGameTrackingEnabled(enabled: boolean) {
  localStorage.setItem(GAME_TRACKING_KEY, String(enabled));
  desktopBridge()?.setGameTrackingEnabled?.(enabled);
  window.dispatchEvent(new CustomEvent<boolean>(GAME_TRACKING_EVENT, { detail: enabled }));
}

export function onGameTrackingPreference(callback: (enabled: boolean) => void): () => void {
  const listener = (event: Event) => callback((event as CustomEvent<boolean>).detail);
  window.addEventListener(GAME_TRACKING_EVENT, listener);
  return () => window.removeEventListener(GAME_TRACKING_EVENT, listener);
}
