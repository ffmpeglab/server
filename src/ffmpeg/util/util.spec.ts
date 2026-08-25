// src/ffmpeg/util/util.spec.ts
import { processFileName, getFileId, documentDir } from './util';
import { config } from '../../config';

describe('processFileName', () => {
  it('keeps safe characters', () => {
    expect(processFileName('my-file_1.0.mp4')).toBe('my-file_1.0.mp4');
  });

  it('strips everything outside [a-zA-Z0-9_.-]', () => {
    expect(processFileName('hello world!')).toBe('helloworld');
    expect(processFileName('a/b/c.txt')).toBe('abc.txt'); // slashes stripped
    expect(processFileName('price: $100%')).toBe('price100');
  });

  it('strips unicode and emoji', () => {
    expect(processFileName('vidéo_ünïcodé🎬.mp4')).toBe('vido_ncod.mp4');
  });

  it.each([
    ['../../etc/passwd', '....etcpasswd'], // separators stripped, dots kept
    ['..\\..\\win\\sys32', '....winsys32'],
    ['file?.png', 'file.png'],
  ])('sanitizes dangerous names: %s -> %s', (input, expected) => {
    expect(processFileName(input)).toBe(expected);
  });

  it('returns empty string for null/undefined (via ?.)', () => {
    expect(processFileName(null as any)).toBe('');
    expect(processFileName(undefined as any)).toBe('');
  });

  it('returns empty string for an empty input', () => {
    expect(processFileName('')).toBe('');
  });
});

describe('getFileId', () => {
  const media = (overrides = {}) =>
    ({
      id: 'm-42',
      filename: 'clip.mp4',
      title: 'My Clip!',
      ...overrides,
    }) as any;

  it('joins id + sanitized filename with an underscore', () => {
    expect(getFileId(media())).toBe('m-42_clip.mp4');
  });

  it('falls back to title when filename is empty', () => {
    expect(getFileId(media({ filename: '' }))).toBe('m-42_MyClip');
  });

  it('falls back to title when filename is undefined', () => {
    expect(getFileId(media({ filename: undefined }))).toBe('m-42_MyClip');
  });

  it('prefers filename over title when both exist', () => {
    expect(getFileId(media({ filename: 'real.mp4', title: 'ignored' }))).toBe(
      'm-42_real.mp4',
    );
  });

  it('yields trailing underscore when both filename and title are missing', () => {
    // `media.filename || media.title` -> undefined -> processFileName(undefined) -> ''
    expect(getFileId({ id: 'm-42' } as any)).toBe('m-42_');
  });

  it('produces filesystem-safe ids even for hostile ids and titles', () => {
    const id = getFileId(
      media({
        id: '../../evil',
        filename: '',
        title: '../../../etc/passwd',
      }),
    );
    expect(id).not.toMatch(/[/\\]/);
  });
});

describe('documentDir', () => {
  it('returns the configured document directory', () => {
    expect(documentDir()).toBe(config.documentDir);
  });
});
