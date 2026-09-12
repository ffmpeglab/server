// src/ffmpeg/util/util.spec.ts
import {
  processFileName,
  getFileId,
  documentDir,
  isBlockedAddress,
  assertPublicUrl,
  pinnedLookup,
  BlockedUrlError,
} from './util';
import { config } from '../../config';
import dns from 'node:dns/promises';

jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: { lookup: jest.fn() },
  lookup: jest.fn(),
}));

const mockLookup = (dns as any).lookup as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// processFileName
// ===========================================================================

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

// ===========================================================================
// getFileId
// ===========================================================================

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

// ===========================================================================
// documentDir
// ===========================================================================

describe('documentDir', () => {
  it('returns the configured document directory', () => {
    expect(documentDir()).toBe(config.documentDir);
  });
});

// ===========================================================================
// isBlockedAddress
// ===========================================================================

describe('isBlockedAddress', () => {
  describe('IPv4 blocked ranges', () => {
    it.each([
      ['0.0.0.0', '"this network"'],
      ['0.255.255.255', '"this network" boundary'],
      ['10.0.0.0', 'RFC1918 low'],
      ['10.255.255.255', 'RFC1918 high'],
      ['100.64.0.0', 'CGNAT low'],
      ['100.127.255.255', 'CGNAT high'],
      ['127.0.0.1', 'loopback'],
      ['127.255.255.255', 'loopback high'],
      ['169.254.0.0', 'link-local low'],
      ['169.254.169.254', 'cloud metadata'],
      ['172.16.0.0', 'RFC1918 low'],
      ['172.31.255.255', 'RFC1918 high'],
      ['192.0.0.0', 'IETF protocol'],
      ['192.0.2.1', 'TEST-NET-1'],
      ['192.88.99.1', '6to4 relay'],
      ['192.168.0.1', 'RFC1918'],
      ['192.168.255.255', 'RFC1918 high'],
      ['198.18.0.0', 'benchmarking low'],
      ['198.19.255.255', 'benchmarking high'],
      ['198.51.100.1', 'TEST-NET-2'],
      ['203.0.113.1', 'TEST-NET-3'],
      ['224.0.0.1', 'multicast'],
      ['239.255.255.255', 'multicast high'],
      ['240.0.0.0', 'reserved'],
      ['255.255.255.255', 'broadcast'],
    ])('blocks %s (%s)', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });
  });

  describe('IPv4 public addresses', () => {
    it.each([
      '1.1.1.1',
      '8.8.8.8',
      '9.9.9.9',
      '93.184.216.34',
      '151.101.1.69',
      '172.15.255.255', // just below 172.16/12
      '172.32.0.0', // just above 172.16/12
      '100.63.255.255', // just below CGNAT
      '100.128.0.0', // just above CGNAT
      '169.253.255.255', // just below link-local
      '169.255.0.0', // just above link-local
    ])('allows %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    });
  });

  describe('IPv6 blocked ranges', () => {
    it.each([
      '::',
      '::1',
      'fe80::1',
      'fe80::dead:beef',
      'fc00::1',
      'fd00::1',
      'ff02::1',
      '2001:db8::1',
      '2002::1',
      '64:ff9b::1',
    ])('blocks %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });
  });

  describe('IPv4-mapped IPv6', () => {
    it('unwraps ::ffff:127.0.0.1 and blocks it', () => {
      expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedAddress('::ffff:7f00:1')).toBe(true);
    });

    it('unwraps ::ffff:10.0.0.1 and blocks it', () => {
      expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
    });

    it('unwraps ::ffff:169.254.169.254 and blocks it', () => {
      expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    });

    it('unwraps ::ffff:8.8.8.8 and allows it', () => {
      expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
    });
  });

  describe('IPv6 public addresses', () => {
    it.each(['2001:4860:4860::8888', '2606:4700:4700::1111'])(
      'allows %s',
      (ip) => {
        expect(isBlockedAddress(ip)).toBe(false);
      },
    );
  });

  describe('non-IP inputs', () => {
    it.each(['example.com', '', 'not-an-ip', '999.999.999.999'])(
      'treats %s as blocked (not an IP)',
      (input) => {
        expect(isBlockedAddress(input)).toBe(true);
      },
    );
  });
});

// ===========================================================================
// assertPublicUrl
// ===========================================================================

describe('assertPublicUrl', () => {
  describe('malformed input', () => {
    it.each(['not a url', 'http://', 'javascript:alert(1)://'])(
      'rejects %s',
      async (input) => {
        // 'javascript:' parses fine as a URL but is not in the allowlist,
        // so it will fail on protocol, not malformed.
        await expect(assertPublicUrl(input)).rejects.toThrow(BlockedUrlError);
      },
    );
  });

  describe('protocol restrictions', () => {
    it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://x'])(
      'rejects %s',
      async (input) => {
        await expect(assertPublicUrl(input)).rejects.toMatchObject({
          code: 'protocol',
        });
      },
    );

    it('allows http: and https:', async () => {
      mockLookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);

      await expect(
        assertPublicUrl('http://example.com/'),
      ).resolves.toBeDefined();
      await expect(
        assertPublicUrl('https://example.com/'),
      ).resolves.toBeDefined();
    });
  });

  describe('embedded credentials', () => {
    it('rejects user:pass@host', async () => {
      await expect(
        assertPublicUrl('http://user:pass@example.com/'),
      ).rejects.toMatchObject({ code: 'credentials' });
    });

    it('rejects user@host', async () => {
      await expect(
        assertPublicUrl('http://user@example.com/'),
      ).rejects.toMatchObject({ code: 'credentials' });
    });
  });

  describe('IP literals', () => {
    it('rejects a loopback literal', async () => {
      await expect(assertPublicUrl('http://127.0.0.1/')).rejects.toMatchObject({
        code: 'ip',
      });
    });

    it('rejects a metadata literal', async () => {
      await expect(
        assertPublicUrl('http://169.254.169.254/latest/meta-data/'),
      ).rejects.toMatchObject({ code: 'ip' });
    });

    it('rejects an IPv6 loopback literal', async () => {
      await expect(assertPublicUrl('http://[::1]/')).rejects.toMatchObject({
        code: 'ip',
      });
    });

    it('rejects a decimal-encoded loopback (Node normalizes it)', async () => {
      await expect(assertPublicUrl('http://2130706433/')).rejects.toMatchObject(
        {
          code: 'ip',
        },
      );
    });

    it('allows a public IP literal without calling DNS', async () => {
      const result = await assertPublicUrl('http://1.1.1.1/');
      expect(result.addresses).toEqual([{ address: '1.1.1.1', family: 4 }]);
      expect(mockLookup).not.toHaveBeenCalled();
    });
  });

  describe('hostname resolution', () => {
    it('rejects when DNS returns no records', async () => {
      mockLookup.mockResolvedValue([]);
      await expect(
        assertPublicUrl('http://nonexistent.example/'),
      ).rejects.toMatchObject({ code: 'dns' });
    });

    it('rejects when any resolved address is blocked', async () => {
      mockLookup.mockResolvedValue([
        { address: '1.1.1.1', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);
      await expect(
        assertPublicUrl('http://mixed.example/'),
      ).rejects.toMatchObject({ code: 'ip' });
    });

    it('rejects nip.io-style DNS rebinding to link-local', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
      await expect(
        assertPublicUrl('http://169.254.169.254.nip.io/'),
      ).rejects.toMatchObject({ code: 'ip' });
    });

    it('allows a hostname that resolves only to public addresses', async () => {
      mockLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);
      const result = await assertPublicUrl('https://example.com/');
      expect(result.addresses).toHaveLength(2);
      expect(result.url.hostname).toBe('example.com');
    });

    it('rejects even if only the AAAA is blocked (mixed record)', async () => {
      mockLookup.mockResolvedValue([
        { address: '1.1.1.1', family: 4 },
        { address: 'fe80::1', family: 6 },
      ]);
      await expect(
        assertPublicUrl('http://sneaky.example/'),
      ).rejects.toMatchObject({ code: 'ip' });
    });

    it('uses dns.lookup with all + verbatim to get every record', async () => {
      mockLookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
      await assertPublicUrl('https://example.com/');
      expect(mockLookup).toHaveBeenCalledWith('example.com', {
        all: true,
        verbatim: true,
      });
    });
  });

  describe('return shape', () => {
    it('returns the parsed URL and the resolved address set', async () => {
      mockLookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
      const result = await assertPublicUrl('https://example.com/path?q=1');
      expect(result.url).toBeInstanceOf(URL);
      expect(result.url.pathname).toBe('/path');
      expect(result.addresses).toEqual([{ address: '1.1.1.1', family: 4 }]);
    });
    it('returns the bare IPv6 address (no brackets) in the address list', async () => {
      const result = await assertPublicUrl('http://[2606:4700::1111]/');
      expect(result.addresses).toEqual([
        { address: '2606:4700::1111', family: 6 },
      ]);
    });
  });
});

// ===========================================================================
// pinnedLookup
// ===========================================================================

describe('pinnedLookup', () => {
  it('returns the pinned address when called without all:true', (done) => {
    const lookup = pinnedLookup([{ address: '1.1.1.1', family: 4 }]);
    lookup('ignored.example', {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe('1.1.1.1');
      expect(family).toBe(4);
      done();
    });
  });

  it('returns the whole array when called with all:true', (done) => {
    const addresses = [
      { address: '1.1.1.1', family: 4 as const },
      { address: '2606:4700::1', family: 6 as const },
    ];
    const lookup = pinnedLookup(addresses);
    lookup('ignored.example', { all: true }, (err, result) => {
      expect(err).toBeNull();
      expect(result).toEqual(addresses);
      done();
    });
  });

  it('handles the (hostname, cb) legacy call shape', (done) => {
    const lookup = pinnedLookup([{ address: '1.1.1.1', family: 4 }]);
    // When the caller passes the callback as the second arg, it must be used.
    lookup('ignored.example', ((err: Error | null, address: string) => {
      expect(err).toBeNull();
      expect(address).toBe('1.1.1.1');
      done();
    }) as any);
  });

  it('ignores the hostname argument (never re-resolves)', (done) => {
    const lookup = pinnedLookup([{ address: '1.1.1.1', family: 4 }]);
    lookup('evil-rebinding.example', {}, (err, address) => {
      expect(address).toBe('1.1.1.1');
      done();
    });
  });
});

// ===========================================================================
// BlockedUrlError
// ===========================================================================

describe('BlockedUrlError', () => {
  it('carries a code and a useful name', () => {
    const err = new BlockedUrlError('nope', 'ip');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BlockedUrlError');
    expect(err.code).toBe('ip');
    expect(err.message).toBe('nope');
  });

  it('accepts all four codes', () => {
    for (const code of [
      'protocol',
      'credentials',
      'dns',
      'ip',
      'malformed',
    ] as const) {
      expect(() => new BlockedUrlError('x', code)).not.toThrow();
    }
  });
});
