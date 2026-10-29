import { desktopBridge, type MediaAccessKind } from './desktop';

export class MediaAccessError extends Error {
  settingsKind: MediaAccessKind | null;

  constructor(message: string, settingsKind: MediaAccessKind | null = null) {
    super(message);
    this.name = 'MediaAccessError';
    this.settingsKind = settingsKind;
  }
}

function requestedKinds(constraints: MediaStreamConstraints) {
  return {
    audio: Boolean(constraints.audio),
    video: Boolean(constraints.video),
  };
}

function blockedKind(
  status: Record<MediaAccessKind, string> | undefined,
  request: { audio: boolean; video: boolean },
): MediaAccessKind | null {
  if (request.audio && ['denied', 'restricted'].includes(status?.microphone ?? '')) return 'microphone';
  if (request.video && ['denied', 'restricted'].includes(status?.camera ?? '')) return 'camera';
  return null;
}

export async function requestUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const bridge = desktopBridge();
  const request = requestedKinds(constraints);
  let systemStatus: Record<MediaAccessKind, string> | undefined;

  if (bridge?.requestMediaAccess) {
    systemStatus = await bridge.requestMediaAccess(request).catch(() => undefined);
    const blocked = blockedKind(systemStatus, request);
    if (blocked) {
      throw new MediaAccessError(
        `${blocked === 'camera' ? 'Camera' : 'Microphone'} access is disabled in system settings.`,
        blocked,
      );
    }
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    const blocked = blockedKind(systemStatus, request);
    if (blocked || name === 'NotAllowedError' || name === 'SecurityError') {
      const kind = blocked ?? (request.audio ? 'microphone' : 'camera');
      throw new MediaAccessError(
        `${kind === 'camera' ? 'Camera' : 'Microphone'} access is blocked. Allow Chirpergram in system settings and restart the app.`,
        kind,
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new MediaAccessError(
        request.video ? 'No working microphone or camera was found.' : 'No working microphone was found.',
      );
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      throw new MediaAccessError(
        request.video
          ? 'The microphone or camera is busy in another app.'
          : 'The microphone is busy in another app.',
      );
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      throw new MediaAccessError('The selected call device is no longer available.');
    }
    throw new MediaAccessError('Chirpergram could not start the microphone or camera.');
  }
}

export function mediaErrorDetails(error: unknown): {
  message: string;
  settingsKind: MediaAccessKind | null;
} {
  if (error instanceof MediaAccessError) {
    return { message: error.message, settingsKind: error.settingsKind };
  }
  return { message: 'Chirpergram could not start the microphone or camera.', settingsKind: null };
}

export function openMediaSettings(kind: MediaAccessKind) {
  desktopBridge()?.openMediaSettings?.(kind);
}
