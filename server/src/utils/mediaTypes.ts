// Single source of truth for which upload types the API accepts.
//
// Why this exists: MediaRecorder reports codec-qualified types such as
// "video/webm;codecs=vp9,opus" or "audio/webm;codecs=opus", and the browser
// sends that string verbatim as the multipart part's Content-Type. The old
// whitelist compared the raw string with exact keys ("video/webm"), so every
// recorded clip was rejected with "Unsupported file type". Normalizing only
// fixes the lookup; it is NOT evidence the bytes are what they claim, so the
// verified type is always decided from the file's leading bytes
// (see sniffMediaType) and the stored extension / Content-Type come from the
// allow-list, never from the client-supplied filename.

export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaType {
  /** Canonical MIME type stored and served for this format. */
  mime: string;
  /** Extension (with dot) used for the stored file. */
  ext: string;
  kind: MediaKind;
}

const T = (mime: string, ext: string, kind: MediaKind): MediaType => ({ mime, ext, kind });

export const MEDIA_TYPES = {
  jpeg: T('image/jpeg', '.jpg', 'image'),
  png: T('image/png', '.png', 'image'),
  webp: T('image/webp', '.webp', 'image'),
  gif: T('image/gif', '.gif', 'image'),
  mp4: T('video/mp4', '.mp4', 'video'),
  mov: T('video/quicktime', '.mov', 'video'),
  webm: T('video/webm', '.webm', 'video'),
  threegp: T('video/3gpp', '.3gp', 'video'),
  weba: T('audio/webm', '.weba', 'audio'),
  ogg: T('audio/ogg', '.ogg', 'audio'),
  mp3: T('audio/mpeg', '.mp3', 'audio'),
  m4a: T('audio/mp4', '.m4a', 'audio'),
  wav: T('audio/wav', '.wav', 'audio'),
  aac: T('audio/aac', '.aac', 'audio'),
} as const satisfies Record<string, MediaType>;

type TypeKey = keyof typeof MEDIA_TYPES;

// Declared (client-claimed) MIME -> allow-list entry. Includes the aliases real
// browsers / Android gallery apps send for the same container.
const DECLARED: Record<string, TypeKey> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/x-m4v': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': 'threegp',
  'video/3gp': 'threegp',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/aac': 'aac',
};

// Generic types browsers/Android use when they do not know the format. These
// are not rejected outright: the bytes decide. "text/plain" is included because
// multipart parsers (busboy) fall back to it when a part's Content-Type header
// cannot be parsed, e.g. the unquoted comma in "video/webm;codecs=vp9,opus".
// This does not weaken validation: HTML/SVG/text bytes still fail the sniff.
const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'text/plain']);

/**
 * "Video/WebM; codecs=vp9, opus" -> "video/webm". Strips parameters and case.
 * Returns '' for empty / non-string input.
 */
export function normalizeMime(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.split(';')[0].trim().toLowerCase();
}

export function isGenericMime(raw: unknown): boolean {
  return GENERIC.has(normalizeMime(raw));
}

/** Allow-list entry for a declared MIME (after normalization), if any. */
export function typeForDeclaredMime(raw: unknown): MediaType | undefined {
  const key = DECLARED[normalizeMime(raw)];
  return key ? MEDIA_TYPES[key] : undefined;
}

function ascii(buf: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}

/** Brands of the ISO base media "ftyp" box that identify audio-only MP4. */
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ']);
const QUICKTIME_BRANDS = new Set(['qt  ']);
const THREEGP_PREFIX = ['3gp', '3g2'];

/**
 * Identify a file from its leading bytes. `declared` is only used to break
 * ties that bytes cannot (webm audio vs video share the EBML header; mp4 vs
 * m4a differ only by brand, so brand wins; ogg is always audio here).
 * Returns undefined when the bytes match nothing on the allow-list, which is
 * what rejects HTML / SVG / scripts renamed to look like media.
 */
export function sniffMediaType(head: Uint8Array, declared?: unknown): MediaType | undefined {
  if (head.length < 4) return undefined;
  const declaredKind = typeForDeclaredMime(declared)?.kind;

  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return MEDIA_TYPES.jpeg;
  // PNG
  if (head[0] === 0x89 && ascii(head, 1, 4) === 'PNG') return MEDIA_TYPES.png;
  // GIF87a / GIF89a
  if (ascii(head, 0, 4) === 'GIF8') return MEDIA_TYPES.gif;
  // RIFF....WEBP / RIFF....WAVE
  if (ascii(head, 0, 4) === 'RIFF' && head.length >= 12) {
    const form = ascii(head, 8, 12);
    if (form === 'WEBP') return MEDIA_TYPES.webp;
    if (form === 'WAVE') return MEDIA_TYPES.wav;
    return undefined;
  }
  // Ogg
  if (ascii(head, 0, 4) === 'OggS') return MEDIA_TYPES.ogg;
  // EBML (WebM / Matroska). Containers cannot be told apart cheaply, so trust
  // the declared kind: audio/* -> .weba, anything else -> video.
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return declaredKind === 'audio' ? MEDIA_TYPES.weba : MEDIA_TYPES.webm;
  }
  // ISO base media: "....ftypBRND"
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (QUICKTIME_BRANDS.has(brand)) return MEDIA_TYPES.mov;
    if (THREEGP_PREFIX.some((p) => brand.startsWith(p))) {
      return declaredKind === 'audio' ? MEDIA_TYPES.m4a : MEDIA_TYPES.threegp;
    }
    if (AUDIO_BRANDS.has(brand)) return MEDIA_TYPES.m4a;
    // isom / mp42 / avc1 / M4V etc. An audio-declared mp4 recorded by Safari
    // also uses isom/mp42, so honour an audio declaration.
    return declaredKind === 'audio' ? MEDIA_TYPES.m4a : MEDIA_TYPES.mp4;
  }
  // MP3: ID3 tag or MPEG frame sync (FF Ex / FF Fx)
  if (ascii(head, 0, 3) === 'ID3') return MEDIA_TYPES.mp3;
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    // ADTS AAC has layer bits 00; MP3 has layer 01/10/11.
    return (head[1] & 0x06) === 0 ? MEDIA_TYPES.aac : MEDIA_TYPES.mp3;
  }
  return undefined;
}

export interface ResolvedMedia {
  type: MediaType;
  /** True when the declared type was generic/unknown and bytes decided. */
  inferred: boolean;
}

export type MediaRejection =
  | { ok: false; code: 'empty' | 'unsupported' | 'mismatch'; message: string }
  | ({ ok: true } & ResolvedMedia);

/**
 * Decide the final type of an uploaded file from its declared MIME and leading
 * bytes. The bytes must match the allow-list; if the client declared a
 * specific type, the detected *kind* (image/video/audio) must agree with it so
 * "video/mp4" cannot smuggle an image or vice-versa.
 */
export function resolveUpload(head: Uint8Array, size: number, declared: unknown): MediaRejection {
  if (size === 0 || head.length === 0) {
    return { ok: false, code: 'empty', message: 'The uploaded file is empty.' };
  }
  const sniffed = sniffMediaType(head, declared);
  if (!sniffed) {
    return {
      ok: false,
      code: 'unsupported',
      message:
        'Unsupported file format. Use JPEG, PNG, WebP, GIF, MP4, MOV, WebM, 3GP, or common audio formats.',
    };
  }
  const claimed = typeForDeclaredMime(declared);
  if (claimed && claimed.kind !== sniffed.kind) {
    return {
      ok: false,
      code: 'mismatch',
      message: 'The file content does not match its declared type.',
    };
  }
  return { ok: true, type: sniffed, inferred: !claimed };
}

/** Whether a declared MIME is acceptable at the early (header-only) stage. */
export function isAcceptableDeclaredMime(raw: unknown): boolean {
  return typeForDeclaredMime(raw) !== undefined || isGenericMime(raw);
}

/** Kinds each multipart field may carry. */
export const FIELD_KINDS: Record<string, MediaKind[]> = {
  image: ['image'],
  video: ['video'],
  videoNote: ['video'],
  audio: ['audio'],
  // Posts / stories historically accepted any allow-listed media type.
  media: ['image', 'video', 'audio'],
  avatar: ['image'],
  banner: ['image'],
};
