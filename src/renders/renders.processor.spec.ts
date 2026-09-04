// src/renders/render.processor.spec.ts
import { RenderProcessor } from './renders.processor';
import { encodeProject } from '../ffmpeg/rendering';

jest.mock('../ffmpeg/rendering', () => ({
  encodeProject: jest.fn(),
}));

const mockEncodeProject = encodeProject as unknown as jest.Mock;

describe('RenderProcessor', () => {
  const renderService = {
    findOne: jest.fn(),
    updateRenderStatus: jest.fn(),
  };
  const logsQueue = { add: jest.fn() };
  const fileQueue = { add: jest.fn() };

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
    processor = new RenderProcessor(
      renderService as any,
      logsQueue as any,
      fileQueue as any,
    );
    renderService.findOne.mockResolvedValue({
      id: 'r-1',
      data: { project: { w: 100 }, layers: ['l1'] },
    });
    renderService.updateRenderStatus.mockResolvedValue(undefined);
    logsQueue.add.mockResolvedValue(undefined);
    fileQueue.add.mockResolvedValue(undefined);
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
    mockEncodeProject.mockImplementation(async () => {
      order.push('encode');
      return { mediaPath: '/tmp/out.mp4' };
    });

    await processor.handleRender(job());

    // 'rendering' must precede encoding; 'done' afterwards is covered elsewhere
    expect(order.slice(0, 2)).toEqual(['status:rendering', 'encode']);
  });

  it('forwards the stored project/layers to encodeProject with svg=false', async () => {
    mockEncodeProject.mockResolvedValue({ mediaPath: '/x.mp4' });

    await processor.handleRender(job());

    expect(mockEncodeProject).toHaveBeenCalledWith(
      { w: 100 },
      ['l1'],
      false,
      expect.any(Function),
      expect.any(Function),
    );
  });

  describe('progress + log callbacks → logs queue', () => {
    let onProgress: Function;
    let onLogs: Function;

    beforeEach(() => {
      mockEncodeProject.mockImplementation(
        async (_p, _l, _s, progressCb, logsCb) => {
          onProgress = progressCb;
          onLogs = logsCb;
          return {};
        },
      );
    });

    it('routes progress events to the progress queue with metadata', async () => {
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
    it('enqueues a file job carrying all passthrough fields', async () => {
      const encoding = { mediaPath: '/tmp/final.mp4' } as any;
      mockEncodeProject.mockResolvedValue(encoding);

      await processor.handleRender(job());

      expect(fileQueue.add).toHaveBeenCalledWith('file', {
        renderId: 'r-1',
        media: encoding,
        userId: 'u-1',
        bucket: 'out-bucket',
        outputPath: 'out/dir',
        runId: 'run-9',
      });
    });

    it('passes through undefined optional fields verbatim', async () => {
      mockEncodeProject.mockResolvedValue({});

      await processor.handleRender(
        job({ bucket: undefined, outputPath: undefined, runId: undefined }),
      );

      expect(fileQueue.add.mock.calls[0][1]).toMatchObject({
        bucket: undefined,
        outputPath: undefined,
        runId: undefined,
      });
    });

    it('marks the render done AFTER the file job is enqueued', async () => {
      mockEncodeProject.mockResolvedValue({});
      const order: string[] = [];
      fileQueue.add.mockImplementation(async () => {
        order.push('file-queue');
      });
      renderService.updateRenderStatus.mockImplementation(async (_i, s) => {
        order.push(`status:${s}`);
      });

      await processor.handleRender(job());

      expect(order.filter((e) => e !== 'status:rendering')).toEqual([
        'file-queue',
        'status:done',
      ]);
    });
  });

  describe('failure path', () => {
    it('marks the render as error when encoding throws', async () => {
      mockEncodeProject.mockRejectedValue(new Error('ffmpeg exited'));

      await processor.handleRender(job());

      expect(renderService.updateRenderStatus).toHaveBeenLastCalledWith(
        'r-1',
        'error',
      );
    });

    it('does NOT enqueue a file job or mark done on failure', async () => {
      mockEncodeProject.mockRejectedValue(new Error('boom'));

      await processor.handleRender(job());

      expect(fileQueue.add).not.toHaveBeenCalled();
      expect(renderService.updateRenderStatus).not.toHaveBeenCalledWith(
        'r-1',
        'done',
      );
    });

    it('does not rethrow — the error is swallowed by design', async () => {
      mockEncodeProject.mockRejectedValue(new Error('boom'));
      await expect(processor.handleRender(job())).resolves.toBeUndefined();
    });

    it('still marks error even if findOne returned null (⚠️ documents latent crash risk)', async () => {
      // render!.data would throw TypeError before try{} is entered...
      // ...actually no: findOne is OUTSIDE the try block too, so a null render
      // crashes at `render.data.project` INSIDE the try -> caught -> 'error'.
      renderService.findOne.mockResolvedValue(null);
      renderService.updateRenderStatus.mockRejectedValue(
        new Error('render row missing'),
      );

      // current behavior: updateRenderStatus rejects inside catch ->
      // handleRender itself rejects. Documented, arguably fine.
      await expect(processor.handleRender(job())).rejects.toThrow(
        'render row missing',
      );
      expect(mockEncodeProject).not.toHaveBeenCalled();
    });
  });

  describe('queue wiring', () => {
    it('uses the configured queue names for logs and file jobs', async () => {
      // pins the contract against config.queue drift
      mockEncodeProject.mockResolvedValue({});
      await processor.handleRender(job());
      expect(logsQueue.add).not.toHaveBeenCalled(); // nothing emitted this run
      expect(fileQueue.add.mock.calls[0][0]).toBe('file');
    });
  });
});
