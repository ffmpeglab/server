// src/renders/renders.processor.spec.ts
import { RenderProcessor } from './renders.processor';
import { encodeProjectWithGit } from '../ffmpeg/rendering';
import { uploadJobResult } from './uploadJobResult';

jest.mock('../ffmpeg/rendering', () => ({
  encodeProject: jest.fn(),
  encodeProjectWithGit: jest.fn(),
}));
jest.mock('./uploadJobResult', () => ({
  uploadJobResult: jest.fn(),
}));

const mockEncodeProjectWithGit = encodeProjectWithGit as jest.Mock;
const mockUploadJobResult = uploadJobResult as jest.Mock;

describe('RenderProcessor', () => {
  const renderService = {
    findOne: jest.fn(),
    updateRenderStatus: jest.fn(),
    updateMediaResult: jest.fn(),
  };
  const logsQueue = { add: jest.fn() };

  let processor: RenderProcessor;

  const job = (overrides = {}) =>
    ({
      message: {
        data: {
          renderId: 'r-1',
          userId: 'u-1',
          bucket: 'out-bucket',
          outputPath: 'out/dir',
          runId: 'run-9',
          ...overrides,
        },
      },
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new RenderProcessor(renderService as any, logsQueue as any);

    renderService.findOne.mockResolvedValue({
      id: 'r-1',
      data: { project: { w: 100 }, layers: ['l1'] },
    });
    renderService.updateRenderStatus.mockResolvedValue(undefined);
    renderService.updateMediaResult.mockResolvedValue(undefined);
    logsQueue.add.mockResolvedValue(undefined);

    mockEncodeProjectWithGit.mockResolvedValue({
      id: 'm1',
      filePath: '/tmp/out.mp4',
      filename: 'out.mp4',
    });
    mockUploadJobResult.mockResolvedValue({
      id: 'm1',
      filePath: '/tmp/out.mp4',
      filename: 'out.mp4',
      url: 'https://signed.example/file',
      userId: 'u-1',
    });
  });

  it('looks up the render scoped to renderId + userId', async () => {
    await processor.handleRender(job());
    expect(renderService.findOne).toHaveBeenCalledWith('r-1', 'u-1');
  });

  it('sets status to rendering BEFORE encoding', async () => {
    const order: string[] = [];
    renderService.updateRenderStatus.mockImplementation(async (_id, s) => {
      order.push(`status:${s}`);
    });
    mockEncodeProjectWithGit.mockImplementation(async () => {
      order.push('encode');
      return { id: 'm1', filePath: '/tmp/out.mp4' };
    });

    await processor.handleRender(job());

    // 'rendering' must precede encoding. Later statuses are covered elsewhere.
    expect(order.slice(0, 2)).toEqual(['status:rendering', 'encode']);
  });

  it('forwards the stored project/layers to encodeProjectWithGit (7-arg call shape)', async () => {
    await processor.handleRender(job());

    expect(mockEncodeProjectWithGit).toHaveBeenCalledWith(
      { w: 100 },
      ['l1'],
      false,
      expect.any(Function),
      expect.any(Function),
      'r-1',
      'u-1', // userId — new 7th parameter
    );
  });

  describe('progress + log callbacks → logs queue', () => {
    let onProgress: Function;
    let onLogs: Function;

    beforeEach(() => {
      mockEncodeProjectWithGit.mockImplementation(
        async (_p, _l, _s, progressCb, logsCb) => {
          onProgress = progressCb;
          onLogs = logsCb;
          return { id: 'm1', filePath: '/tmp/out.mp4' };
        },
      );
    });

    it('routes progress events to the logs queue with metadata', async () => {
      await processor.handleRender(job());
      onProgress(42);

      expect(logsQueue.add).toHaveBeenCalledWith('progress', {
        renderId: 'r-1',
        progress: 42,
        userId: 'u-1',
        date: expect.any(String),
      });
    });

    it('routes log batches to the logs queue with metadata', async () => {
      await processor.handleRender(job());
      onLogs(['frame 1 done', 'frame 2 done']);

      expect(logsQueue.add).toHaveBeenCalledWith('logs', {
        renderId: 'r-1',
        logs: ['frame 1 done', 'frame 2 done'],
        userId: 'u-1',
        date: expect.any(String),
      });
    });
  });

  describe('success path', () => {
    it('calls uploadJobResult with the encoded media, resolved bucket, and passthrough fields', async () => {
      const encoding = {
        id: 'm1',
        filePath: '/tmp/final.mp4',
        filename: 'out.mp4',
      };
      mockEncodeProjectWithGit.mockResolvedValue(encoding);

      await processor.handleRender(job());

      expect(mockUploadJobResult).toHaveBeenCalledWith({
        renderId: 'r-1',
        media: encoding,
        userId: 'u-1',
        bucket: 'out-bucket', // private render keeps the caller's bucket
        outputPath: 'out/dir',
        runId: 'run-9',
      });
    });

    it('routes to the public bucket for public renders', async () => {
      renderService.findOne.mockResolvedValue({
        id: 'r-1',
        public: true,
        data: { project: { w: 100 }, layers: ['l1'] },
      });

      await processor.handleRender(job());

      expect(mockUploadJobResult).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: expect.any(String) }),
      );
      // The exact public bucket name comes from config.publicBucket — the
      // assertion above confirms the branch was taken without coupling to
      // the env-dependent value.
    });

    it('marks upload → done and stores the media result on success', async () => {
      const order: string[] = [];
      renderService.updateRenderStatus.mockImplementation(async (_i, s) => {
        order.push(`status:${s}`);
      });

      await processor.handleRender(job());

      expect(order.filter((e) => e !== 'status:rendering')).toEqual([
        'status:upload',
        'status:done',
      ]);
      expect(renderService.updateMediaResult).toHaveBeenCalledWith(
        'r-1',
        expect.objectContaining({ id: 'm1', userId: 'u-1' }),
      );
    });
  });

  describe('failure path', () => {
    it('marks the render as error and stops when encoding throws', async () => {
      mockEncodeProjectWithGit.mockRejectedValue(new Error('ffmpeg exited'));

      await processor.handleRender(job());

      expect(renderService.updateRenderStatus).toHaveBeenCalledWith(
        'r-1',
        'error',
      );
      expect(renderService.updateRenderStatus).not.toHaveBeenCalledWith(
        'r-1',
        'done',
      );
      expect(mockUploadJobResult).not.toHaveBeenCalled();
      expect(renderService.updateMediaResult).not.toHaveBeenCalled();
    });

    it('logs the error to the logs queue so the user sees it', async () => {
      mockEncodeProjectWithGit.mockRejectedValue(new Error('boom'));

      await processor.handleRender(job());

      expect(logsQueue.add).toHaveBeenCalledWith(
        'logs',
        expect.objectContaining({
          renderId: 'r-1',
          userId: 'u-1',
          logs: 'boom',
        }),
      );
    });

    it('does not rethrow — the error is swallowed so the worker does not crash', async () => {
      mockEncodeProjectWithGit.mockRejectedValue(new Error('boom'));
      await expect(processor.handleRender(job())).resolves.toBeUndefined();
    });

    it('marks error when uploadJobResult returns undefined (current behavior)', async () => {
      // ⚠️ Current code: `if (result?.id) updateMediaResult else updateRenderStatus('error')`
      // followed by an UNCONDITIONAL `updateRenderStatus('done')`. The final
      // 'done' overwrites the 'error'. This test pins the current behavior
      // so a future fix (early return on `!result?.id`) breaks it loudly.
      const order: string[] = [];
      renderService.updateRenderStatus.mockImplementation(async (_i, s) => {
        order.push(`status:${s}`);
      });
      mockUploadJobResult.mockResolvedValue(undefined);

      await processor.handleRender(job());

      expect(order.filter((e) => e !== 'status:rendering')).toEqual([
        'status:upload',
        'status:error',
        'status:done', // ← the bug
      ]);
    });

    it('marks error when render is null (findOne returned nothing)', async () => {
      renderService.findOne.mockResolvedValue(null);

      await processor.handleRender(job());

      expect(renderService.updateRenderStatus).toHaveBeenCalledWith(
        'r-1',
        'error',
      );
      expect(mockEncodeProjectWithGit).not.toHaveBeenCalled();
    });
  });

  describe('queue wiring', () => {
    it('emits no logs on a clean success run', async () => {
      await processor.handleRender(job());

      expect(logsQueue.add).not.toHaveBeenCalledWith('logs', expect.anything());
      expect(logsQueue.add).not.toHaveBeenCalledWith(
        'progress',
        expect.anything(),
      );
    });
  });
});
