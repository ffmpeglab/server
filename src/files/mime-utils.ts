// mime-utils.ts – Map file extensions to MIME types

const MIME_MAP: Record<string, string> = {
  // Audio
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.alac': 'audio/alac',

  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.m4v': 'video/mp4',
  '.3gp': 'video/3gpp',
  '.ogv': 'video/ogg',
  '.ts': 'video/mp2t',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',

  // Image
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.heif': 'image/heif',

  // Documents / other
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Subtitle formats
  '.srt': 'text/plain',
  '.ass': 'text/plain',
  '.vtt': 'text/vtt',
  '.ssa': 'text/plain',

  // Playlist
  '.m3u': 'audio/x-mpegurl',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.pls': 'audio/x-scpls',

  // Fallback
  default: 'application/octet-stream',
};

/**
 * Get the MIME type for a file based on its extension.
 * @param filePath - The full file path or just the filename.
 * @returns The MIME type string, or 'application/octet-stream' if unknown.
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return MIME_MAP['default'];
  const key = `.${ext}`;
  return MIME_MAP[key] || MIME_MAP['default'];
}

/**
 * Get the MIME type for a file based on its extension, with a fallback.
 * @param filePath - The full file path or just the filename.
 * @param fallback - Custom fallback MIME type.
 */
export function getMimeTypeWithFallback(
  filePath: string,
  fallback: string = 'application/octet-stream',
): string {
  const mime = getMimeType(filePath);
  return mime === MIME_MAP['default'] ? fallback : mime;
}
