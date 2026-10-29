// Helpers for recording voice messages and round "video circles" with the
// browser's MediaRecorder. Codec support varies (Chrome/Electron prefer webm,
// Safari prefers mp4), so pick the first supported type at runtime.

function firstSupported(types: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return types.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export function supportedAudioMime(): string | undefined {
  return firstSupported(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']);
}

export function supportedVideoMime(): string | undefined {
  return firstSupported([
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]);
}

export function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return mime.startsWith('audio') ? 'm4a' : 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function canRecordMedia(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
