/**
 * Strict avatar image validation (Data URI + MIME + Magic-byte binary inspection)
 */

const MAX_AVATAR_BYTES = 512 * 1024; // 512 KB binary limit

export interface AvatarValidationResult {
  valid: boolean;
  dataUrl?: string;
  error?: string;
}

export function validateAvatarDataUrl(raw: unknown): AvatarValidationResult {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Avatar must be a base64 image data URL.' };
  }

  const trimmed = raw.trim();
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      error: 'Only PNG, JPEG, or WebP base64 images are accepted.'
    };
  }

  const declaredMime = match[1];
  const base64Payload = match[2];

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Payload, 'base64');
  } catch {
    return { valid: false, error: 'Invalid base64 image encoding.' };
  }

  if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) {
    return {
      valid: false,
      error: 'Profile picture must be smaller than 512 KB.'
    };
  }

  // Verify actual binary magic bytes match declared MIME
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  const mimeMatchesMagic =
    (declaredMime === 'image/png' && isPng) ||
    (declaredMime === 'image/jpeg' && isJpeg) ||
    (declaredMime === 'image/webp' && isWebp);

  if (!mimeMatchesMagic) {
    return {
      valid: false,
      error: 'Image file signature does not match the declared image format.'
    };
  }

  return {
    valid: true,
    dataUrl: `data:${declaredMime};base64,${buffer.toString('base64')}`
  };
}
