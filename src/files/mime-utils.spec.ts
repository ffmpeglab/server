// src/files/mime-utils.spec.ts
import { getMimeType, getMimeTypeWithFallback } from './mime-utils';

describe('mime-utils', () => {
  it.each([
    ['clip.mp4', 'video/mp4'],
    ['song.WAV', 'audio/wav'], // case-insensitive
    ['/deep/path/img.PNG', 'image/png'],
    ['sub.srt', 'text/plain'],
    ['archive.tar.gz', 'application/gzip'], // last extension wins
  ])('getMimeType(%s) === %s', (input, expected) => {
    expect(getMimeType(input)).toBe(expected);
  });

  it('falls back to application/octet-stream for unknown/no extension', () => {
    expect(getMimeType('noext')).toBe('application/octet-stream');
    expect(getMimeType('weird.unheardof')).toBe('application/octet-stream');
  });

  it('getMimeTypeWithFallback returns custom fallback only when unmapped', () => {
    expect(getMimeTypeWithFallback('a.mp4', 'custom')).toBe('video/mp4');
    expect(getMimeTypeWithFallback('a.unknown', 'custom/type')).toBe(
      'custom/type',
    );
  });
});
