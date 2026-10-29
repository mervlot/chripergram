// Client-side classification of files picked for a DM attachment. The server
// remains authoritative (it verifies the bytes); this only routes a file to the
// right multipart field and gives early, readable feedback.

export type AttachmentKind = 'image' | 'video';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|3gp|3gpp)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_TYPES = new Set(['video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gp']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

/** Matches the server default (MAX_UPLOAD_MB=25). The server enforces the real limit. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** `accept` for the file input: explicit list plus extensions (Android pickers often omit file.type). */
export const ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.m4v,.mov,.webm,.3gp';

export function baseMime(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function classifyAttachment(file: Pick<File, 'type' | 'name'>): AttachmentKind | null {
  const mime = baseMime(file.type || '');
  if (VIDEO_TYPES.has(mime)) return 'video';
  if (IMAGE_TYPES.has(mime)) return 'image';
  // Android pickers can hand over an empty or generic type; fall back to the name.
  if (!mime || mime === 'application/octet-stream') {
    if (VIDEO_EXT.test(file.name)) return 'video';
    if (IMAGE_EXT.test(file.name)) return 'image';
  }
  return null;
}

/** Returns a user-facing error, or null if the file looks acceptable. */
export function attachmentProblem(file: Pick<File, 'type' | 'name' | 'size'>): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (!classifyAttachment(file)) {
    return 'Unsupported file. Choose a JPEG, PNG, WebP or GIF image, or an MP4, MOV, WebM or 3GP video.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `That file is too large (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}
