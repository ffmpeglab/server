import { EventEmitter } from 'node:events';
import { syncMedia } from './syncMedia';
import { downloadFile } from './downloadFile';
import { documentDir, getFileId, assertPublicUrl } from './util';
import { config } from '../../config';
import { createS3Client } from '../../s3client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import fs from 'fs';
import http from 'http';
import https from 'https';

jest.mock('fs');
jest.mock('http');
jest.mock('https');
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('../../s3client', () => ({ createS3Client: jest.fn() }));
jest.mock('./util', () => ({
  assertPublicUrl: jest.fn(async (arg: string) => ({
    url: new URL(arg),
    addresses: [{ address: '93.184.216.34', family: 4 }],
  })),
  pinnedLookup: jest.fn(() => jest.fn()),
  documentDir: jest.fn(() => '/tmp/docdir'),
  getFileId: jest.fn(() => 'file-abc.mp4'),
  BlockedUrlError: class BlockedUrlError extends Error {},
}));

const mockGetSignedUrl = getSignedUrl as unknown as jest.Mock;
const mockCreateS3Client = createS3Client as unknown as jest.Mock;
const mockMkdirSync = fs.mkdirSync as unknown as jest.Mock;
const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
const mockUnlink = fs.unlink as unknown as jest.Mock;
const mockHttpGet = http.get as unknown as jest.Mock;
const mockHttpsGet = https.get as unknown as jest.Mock;

// ---------------- fakes ----------------

class FakeFileStream extends EventEmitter {
  filePath: string;
  written: Buffer[] = [];
  closed = false;
  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }
  write(chunk: any) {
    this.written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }
  end(cb?: () => void) {
    cb?.();
    return this;
  }
  pipe(_src: any) {
    return this;
  }
  close(cb?: () => void) {
    this.closed = true;
    cb?.();
  }
}

class FakeResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  pipe: jest.Mock;

  constructor(statusCode = 200) {
    super();
    this.statusCode = statusCode;
    this.headers = { 'content-type': 'video/mp4' };
    this.pipe = jest.fn();
  }

  resume() {
    return this;
  }
}

class FakeRequest extends EventEmitter {
  destroyed = false;
  destroy(err?: Error) {
    this.destroyed = true;
    if (err) this.emit('error', err);
  }
  setTimeout(_ms: number, _cb: () => void) {
    return this;
  }
}

let activeStream: FakeFileStream | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  activeStream = undefined;
  mockMkdirSync.mockReturnValue(undefined);
  mockUnlink.mockImplementation((_p, cb) => cb?.());
  mockCreateWriteStream.mockImplementation((p: string) => {
    activeStream = new FakeFileStream(p);
    return activeStream;
  });
  mockGetSignedUrl.mockResolvedValue(
    'https://presigned.example.com/obj?sig=xyz',
  );
  mockCreateS3Client.mockResolvedValue({ send: jest.fn() });
});

// helper: install a fake HTTP client that immediately responds
const respondWith = (
  mockGet: jest.Mock,
  response: FakeResponse,
): FakeRequest => {
  const req = new FakeRequest();
  mockGet.mockImplementation((_url, _opts, cb) => {
    process.nextTick(() => cb(response));
    return req;
  });
  return req;
};

// =========================================================
// downloadFile
// =========================================================

describe('downloadFile', () => {
  const args = (overrides = {}) => ({
    filePath: '/tmp/docdir/p/file.mp4',
    dirPath: '/tmp/docdir/p',
    url: 'http://example.com/file.mp4',
    ...overrides,
  });

  describe('happy path', () => {
    it('creates the target directory recursively', async () => {
      const res = new FakeResponse(200);
      respondWith(mockHttpGet, res);

      const p = downloadFile(args());
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/docdir/p', {
        recursive: true,
      });
    });

    it('does not reject when mkdir fails (directory may already exist)', async () => {
      mockMkdirSync.mockImplementation(() => {
        throw new Error('EEXIST');
      });
      const res = new FakeResponse(200);
      respondWith(mockHttpGet, res);

      const p = downloadFile(args());
      await flush();
      activeStream!.emit('finish');
      await expect(p).resolves.toBeDefined();
    });

    it('pipes the response into a write stream at the given path', async () => {
      const res = new FakeResponse(200);
      const pipeSpy = jest.spyOn(res, 'pipe');
      respondWith(mockHttpGet, res);

      const p = downloadFile(args());
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(pipeSpy).toHaveBeenCalledWith(activeStream!);
      expect(mockCreateWriteStream).toHaveBeenCalledWith(
        '/tmp/docdir/p/file.mp4',
      );
    });

    it('closes the file stream on finish and resolves', async () => {
      const res = new FakeResponse(200);
      respondWith(mockHttpGet, res);

      const p = downloadFile(args());
      await flush();

      expect(activeStream!.closed).toBe(false);
      activeStream!.emit('finish');
      await p;

      expect(activeStream!.closed).toBe(true);
    });

    it('selects the http client for http URLs', async () => {
      const res = new FakeResponse(200);
      respondWith(mockHttpGet, res);
      const p = downloadFile(args({ url: 'http://x.com/a.mp4' }));
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(mockHttpGet).toHaveBeenCalled();
      expect(mockHttpsGet).not.toHaveBeenCalled();
    });

    it('selects the https client for https URLs', async () => {
      const res = new FakeResponse(200);
      respondWith(mockHttpsGet, res);
      const p = downloadFile(args({ url: 'https://x.com/a.mp4' }));
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(mockHttpsGet).toHaveBeenCalled();
      expect(mockHttpGet).not.toHaveBeenCalled();
    });
  });

  describe('HTTP error status codes', () => {
    it.each([401, 403, 404, 500])(
      'rejects on status %i and does not resolve successfully',
      async (status) => {
        const res = new FakeResponse(status);
        respondWith(mockHttpGet, res);

        await expect(downloadFile(args())).rejects.toThrow(`HTTP ${status}`);

        expect(res.pipe).not.toHaveBeenCalled();
      },
    );

    it('cleans up the partial file on HTTP error', async () => {
      const res = new FakeResponse(404);
      respondWith(mockHttpGet, res);

      await expect(downloadFile(args())).rejects.toThrow();

      expect(mockUnlink).toHaveBeenCalledWith(
        '/tmp/docdir/p/file.mp4',
        expect.any(Function),
      );
      expect(mockCreateWriteStream).not.toHaveBeenCalled();
    });
  });

  describe('network failures', () => {
    it('rejects when the request emits an error', async () => {
      const req = respondWith(mockHttpGet, new FakeResponse(200));

      const p = downloadFile(args());
      await flush();

      req.emit('error', new Error('ECONNRESET'));

      await expect(p).rejects.toThrow('ECONNRESET');
      expect(mockUnlink).toHaveBeenCalled();
      expect(activeStream!.closed).toBe(true);
    });

    it('rejects when the response stream errors mid-download', async () => {
      const res = new FakeResponse(200);
      respondWith(mockHttpGet, res);

      const p = downloadFile(args());
      await flush();

      res.emit('error', new Error('socket hang up'));

      await expect(p).rejects.toThrow('socket hang up');
      expect(mockUnlink).toHaveBeenCalled();
    });

    it('never leaves the promise pending forever on request error (hang prevention)', async () => {
      const req = respondWith(mockHttpGet, new FakeResponse(200));
      const p = downloadFile(args());
      await flush();

      req.destroy(new Error('aborted'));

      const hung = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('PROMISE HUNG')), 50),
      );
      await Promise.race([p.catch(() => {}), hung]);
    });
  });

  describe('timeouts', () => {
    it('registers a timeout on the request', async () => {
      const setTimeoutSpy = jest.fn(() => new FakeRequest());
      mockHttpGet.mockImplementation((_u, _o, cb) => {
        process.nextTick(() => cb(new FakeResponse(200)));
        const req = new FakeRequest();
        req.setTimeout = setTimeoutSpy as any;
        return req;
      });

      const p = downloadFile(args());
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(setTimeoutSpy).toHaveBeenCalled();
    });

    it('rejects when the timeout fires', async () => {
      let timeoutCb: () => void = () => {};
      mockHttpGet.mockImplementation((_u, _o, cb) => {
        const req = new FakeRequest();
        req.setTimeout = (_ms, tCb) => {
          timeoutCb = tCb;
          return req;
        };
        process.nextTick(() => cb(new FakeResponse(200)));
        return req;
      });

      const p = downloadFile(args());
      await flush();
      timeoutCb();

      await expect(p).rejects.toThrow(/timeout/i);
    });
  });

  describe('cleanup invariants', () => {
    it('leaves no partial file behind on any failure path', async () => {
      const req = respondWith(mockHttpGet, new FakeResponse(200));
      const p = downloadFile(args());
      await flush();
      req.emit('error', new Error('boom'));
      try {
        await p;
      } catch {}

      const unlinkPaths = mockUnlink.mock.calls.map((c) => c[0]);
      expect(unlinkPaths).toContain('/tmp/docdir/p/file.mp4');
    });
  });
});

// =========================================================
// syncMedia
// =========================================================

describe('syncMedia', () => {
  const RENDER_ID = 'render-1';

  const publicMedia = (overrides = {}) => ({
    url: 'https://cdn.example.com/public/video.mp4',
    folderId: 'proj-1',
    ...overrides,
  });

  const privateMedia = (overrides = {}) => ({
    bucket: 'user-uploads',
    key: 'private/video.mp4',
    url: 'private/video.mp4',
    folderId: 'proj-1',
    ...overrides,
  });

  const startDownload = (status = 200) => {
    const res = new FakeResponse(status);
    respondWith(mockHttpsGet, res);
    return res;
  };

  describe('public files (no bucket)', () => {
    it('downloads directly from media.url without touching S3', async () => {
      startDownload(200);

      const p = syncMedia(publicMedia() as any, RENDER_ID);
      await flush();
      activeStream!.emit('finish');

      await expect(p).resolves.toBe('/tmp/docdir/render-1/file-abc.mp4');
      expect(mockCreateS3Client).not.toHaveBeenCalled();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
      expect(mediaUrlPassedToHttp()).toBe(
        'https://cdn.example.com/public/video.mp4',
      );
    });

    it('propagates download failures', async () => {
      startDownload(404);

      await expect(syncMedia(publicMedia() as any, RENDER_ID)).rejects.toThrow(
        '404',
      );
    });
  });

  describe('private files (bucket set — server credentials flow)', () => {
    it('presigns with the server credential client before downloading', async () => {
      startDownload(200);

      const p = syncMedia(privateMedia() as any, RENDER_ID);
      await flush();
      activeStream!.emit('finish');

      await p;

      expect(mockCreateS3Client).toHaveBeenCalledTimes(1);
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockGetSignedUrl.mock.calls[0][1].input).toEqual({
        Bucket: 'user-uploads',
        Key: 'private/video.mp4',
      });
      expect(mockGetSignedUrl.mock.calls[0][2]).toEqual({
        expiresIn: 86400,
      });
    });

    it('replaces media.url with the presigned URL (bearer token handoff)', async () => {
      startDownload(200);
      const media = privateMedia() as any;

      const p = syncMedia(media, RENDER_ID);
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(media.url).toBe('https://presigned.example.com/obj?sig=xyz');
      expect(mediaUrlPassedToHttp()).toBe(
        'https://presigned.example.com/obj?sig=xyz',
      );
    });

    it('falls back to media.url as Key for legacy medias (urls are always keys)', async () => {
      startDownload(200);
      const media = { bucket: 'b', url: 'renders/legacy/v.mp4', folderId: 'p' };

      const p = syncMedia(media as any, RENDER_ID);
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(mockGetSignedUrl.mock.calls[0][1].input.Key).toBe(
        'renders/legacy/v.mp4',
      );
    });

    it('preserves the bucket fallback semantics (defensive against mutation between guard and use)', async () => {
      startDownload(200);

      const p = syncMedia(privateMedia() as any, RENDER_ID);
      await flush();
      activeStream!.emit('finish');
      await p;

      expect(mockGetSignedUrl.mock.calls[0][1].input.Bucket).toBe(
        'user-uploads',
      );
    });

    it('propagates presigning failures (e.g., expired credentials)', async () => {
      mockCreateS3Client.mockRejectedValue(new Error('creds expired'));

      await expect(syncMedia(privateMedia() as any, RENDER_ID)).rejects.toThrow(
        'creds expired',
      );
      expect(mockCreateWriteStream).not.toHaveBeenCalled();
    });
  });

  describe('expired-presign failure mode (private files)', () => {
    it('⚠️ an expired presigned URL yields HTTP 403 XML body — must be rejected, not cached', async () => {
      startDownload(403);

      await expect(syncMedia(privateMedia() as any, RENDER_ID)).rejects.toThrow(
        '403',
      );

      expect(fs.unlink).toHaveBeenCalledWith(
        '/tmp/docdir/render-1/file-abc.mp4',
        expect.any(Function),
      );
    });
  });

  describe('return value contract', () => {
    it('always returns the local file path (never the stream or URL)', async () => {
      startDownload(200);

      const p = syncMedia(publicMedia() as any, RENDER_ID);
      await flush();
      activeStream!.emit('finish');

      const result = await p;
      expect(typeof result).toBe('string');
      expect(result.startsWith('/tmp/docdir/render-1/')).toBe(true);
    });
  });
});

// ---------------- helpers ----------------

function flush() {
  return new Promise((r) => setImmediate(r));
}

function mediaUrlPassedToHttp(): string {
  const call = mockHttpsGet.mock.calls.at(-1) ?? mockHttpGet.mock.calls.at(-1)!;
  return String(call[0]);
}
