import { execEncode, encodeProject } from './rendering';
import { genRenderCmd } from './util/genRenderCmd';
import { getTotalTime } from './util/getTotalTime';
import { createFFmpeg } from './util/createFFmpeg';
import { syncMedia } from './util/syncMedia';
import { processUserCode } from './util/processUserCode';
import { parseCommand } from './util/parseCommand';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

jest.mock('./util/genRenderCmd');
jest.mock('./util/getTotalTime');
jest.mock('./util/createFFmpeg');
jest.mock('./util/syncMedia');
jest.mock('./util/processUserCode');
jest.mock('./util/parseCommand');
jest.mock('fs');
jest.mock('crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('./util/util', () => ({
  documentDir: jest.fn(() => '/tmp/docdir'),
}));

import { CodeSelection, EditorLayer, EditorProject } from '../types';

const mockGenRenderCmd = genRenderCmd as jest.Mock;
const mockGetTotalTime = getTotalTime as jest.Mock;
const mockCreateFFmpeg = createFFmpeg as jest.Mock;
const mockSyncMedia = syncMedia as jest.Mock;
const mockProcessUserCode = processUserCode as jest.Mock;
const mockParseCommand = parseCommand as jest.Mock;
const mockUUID = randomUUID as jest.Mock;

// ---------- fixtures ----------

const DOC = '/tmp/docdir';

const makeProject = (overrides: any = {}) =>
  ({
    id: 'proj-1',
    title: 'Test Project',
    userId: 'user-1',
    editor: {
      width: 1280,
      height: 720,
      selectedCode: CodeSelection.generated,
      ...overrides,
    },
  }) as unknown as EditorProject;

const genResultDefaults = {
  execCmd: ['-filter_complex', '[0:v]scale=1280:720', '-y', '$OUTPUT_PATH'],
  medias: [{ id: 'm1' }],
  files: ['-i', '$MEDIA_1'],
  outFileId: 'out.mp4',
  encoded: [],
  projectData: undefined,
  assignedMedias: {
    OUTPUT_PATH: `${DOC}/proj-1/out.mp4`,
    MEDIA_1: '/in/a.mp4',
  },
  outputPath: `${DOC}/proj-1/out.mp4`,
};

const makeFfmpegMock = () => {
  const exec = jest.fn().mockResolvedValue(0);
  return {
    exec,
    readAsBase64: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUUID.mockReturnValue('fixed-uuid');
  mockGenRenderCmd.mockReturnValue({ ...genResultDefaults });
  mockGetTotalTime.mockReturnValue(10);
  mockCreateFFmpeg.mockResolvedValue(makeFfmpegMock());
  mockSyncMedia.mockResolvedValue('/synced/path.mp4');
  (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
  (fs.statSync as jest.Mock).mockReturnValue({ size: 12345 });
});

// =====================================================================
// execEncode
// =====================================================================

describe('execEncode', () => {
  const baseCmd = (overrides: any = {}) => ({
    files: [],
    encoded: [],
    outFileId: 'out.mp4',
    outputPath: `${DOC}/proj-1/out.mp4`,
    execCmd: ['-i', '$MEDIA_1', '-y', '$OUTPUT_PATH'],
    mediaOut: {},
    projectData: makeProject(),
    totalTime: 10,
    ffmpeg: makeFfmpegMock(),
    assignedMedias: {
      OUTPUT_PATH: `${DOC}/proj-1/out.mp4`,
      MEDIA_1: '/in/a.mp4',
    },
    ...overrides,
  });
  const baseCmdAfter = ['-i', '/in/a.mp4', '-y', '/tmp/docdir/proj-1/out.mp4'];
  it('creates the project output directory recursively', async () => {
    await execEncode(baseCmd() as any);
    expect(fs.mkdirSync).toHaveBeenCalledWith(`${DOC}/proj-1`, {
      recursive: true,
    });
  });

  it('does not throw when mkdir fails (caught & logged)', async () => {
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {
      throw new Error('EACCES');
    });
    await expect(execEncode(baseCmd() as any)).resolves.toBe(
      `${DOC}/proj-1/out.mp4`,
    );
  });

  it('runs ffmpeg.exec with the substituted arguments for generated code', async () => {
    const cmd = baseCmd();
    // Replace the exec mock to capture the actual arguments after substitution
    const execMock = jest.fn().mockResolvedValue(0);
    cmd.ffmpeg.exec = execMock;

    await execEncode(cmd as any);

    expect(execMock).toHaveBeenCalledWith(baseCmdAfter);
  });

  it('mutates mediaOut with filePath and size from outputPath stats', async () => {
    const mediaOut: any = {};
    await execEncode(baseCmd({ mediaOut }) as any);

    expect(mediaOut.filePath).toBe(`${DOC}/out.mp4`);
    expect(mediaOut.size).toBe(12345);
    expect(fs.statSync).toHaveBeenCalledWith(`${DOC}/proj-1/out.mp4`);
  });

  it('returns outputPath', async () => {
    const result = await execEncode(baseCmd() as any);
    expect(result).toBe(`${DOC}/proj-1/out.mp4`);
  });

  describe('custom code selection', () => {
    beforeEach(() => {
      // Mock processUserCode and parseCommand to return specific arrays
      mockProcessUserCode.mockReturnValue(['-crf', '20']);
      mockParseCommand.mockReturnValue(['-crf', '20']);
    });

    it('routes through processUserCode when code contains filter_complex', async () => {
      const cmd = baseCmd({
        projectData: makeProject({
          selectedCode: CodeSelection.custom,
          code: '-filter_complex stuff"',
        }),
      });
      // Replace exec mock
      const execMock = jest.fn().mockResolvedValue(0);
      cmd.ffmpeg.exec = execMock;
      console.info({ cmd });
      await execEncode(cmd as any);

      expect(mockProcessUserCode).toHaveBeenCalledWith(
        cmd.projectData.editor.code,
      );
      expect(mockParseCommand).not.toHaveBeenCalled();
      expect(execMock).toHaveBeenCalledWith(['-crf', '20']);
    });

    it('routes through parseCommand when no filter_complex', async () => {
      const cmd = baseCmd({
        projectData: makeProject({
          selectedCode: CodeSelection.custom,
          code: '-crf 20',
        }),
      });
      const execMock = jest.fn().mockResolvedValue(0);
      cmd.ffmpeg.exec = execMock;

      await execEncode(cmd as any);

      expect(mockParseCommand).toHaveBeenCalledWith('-crf 20');
      expect(execMock).toHaveBeenCalledWith(['-crf', '20']);
    });

    it('custom-code branch IGNORES the generated execCmd entirely', async () => {
      const cmd = baseCmd({
        projectData: makeProject({
          selectedCode: CodeSelection.custom,
          code: '-y out.mp4',
        }),
      });
      const execMock = jest.fn().mockResolvedValue(0);
      cmd.ffmpeg.exec = execMock;

      await execEncode(cmd as any);

      expect(execMock).toHaveBeenCalledTimes(1);
      // The exec should be called with the parsed custom command, not the generated one
      expect(execMock).toHaveBeenCalledWith(['-crf', '20']);
      // Ensure the generated execCmd was NOT used
      expect(execMock).not.toHaveBeenCalledWith(cmd.execCmd);
    });
  });

  describe('error propagation', () => {
    it('re-throws when ffmpeg.exec fails', async () => {
      const ffmpeg = makeFfmpegMock();
      ffmpeg.exec.mockRejectedValue(new Error('spawn ENOENT'));

      await expect(execEncode(baseCmd({ ffmpeg }) as any)).rejects.toThrow(
        'spawn ENOENT',
      );
    });

    it('rejects when ffmpeg exits with a nonzero code', async () => {
      const ffmpeg = makeFfmpegMock();
      ffmpeg.exec.mockResolvedValue(1);

      await expect(execEncode(baseCmd({ ffmpeg }) as any)).rejects.toThrow(
        'ffmpeg exited with code 1',
      );
      expect(fs.statSync).not.toHaveBeenCalled();
    });

    it('treats undefined exit code as success', async () => {
      const ffmpeg = makeFfmpegMock();
      ffmpeg.exec.mockResolvedValue(undefined as any);

      await expect(execEncode(baseCmd() as any)).resolves.toBe(
        `${DOC}/proj-1/out.mp4`,
      );
    });

    it('throws if output file cannot be stat-ed', async () => {
      (fs.statSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      await expect(execEncode(baseCmd() as any)).rejects.toThrow('ENOENT');
    });
  });
});

// =====================================================================
// encodeProject
// =====================================================================

describe('encodeProject', () => {
  const layer = { media: [] } as unknown as EditorLayer;

  it('generates a uuid-based new media id passed to genRenderCmd', async () => {
    await encodeProject(makeProject(), [layer]);
    expect(mockGenRenderCmd).toHaveBeenCalledWith(
      expect.anything(),
      [layer],
      'fixed-uuid',
    );
  });

  it('strips -i flags from cmd.files before passing onward', async () => {
    mockGenRenderCmd.mockReturnValue({
      ...genResultDefaults,
      files: ['-i', 'MEDIA1', '-i', 'MEDIA_1', '-i', 'MEDIA1', '-i', 'MEDIA_2'],
    });

    const result = await encodeProject(makeProject(), [layer]);
    expect(result.filename).toBe('out.mp4');

    const returnedFiles = mockGenRenderCmd.mock.results[0].value.files;
    expect(returnedFiles.filter((f: string) => f === '-i')).toHaveLength(0);
    expect(returnedFiles).toEqual(['MEDIA1', 'MEDIA_1', 'MEDIA1', 'MEDIA_2']);
  });

  it('syncs all medias before encoding', async () => {
    mockGenRenderCmd.mockReturnValue({
      ...genResultDefaults,
      medias: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    await encodeProject(makeProject(), [layer]);

    expect(mockSyncMedia).toHaveBeenCalledTimes(3);
    expect(mockSyncMedia).toHaveBeenNthCalledWith(1, { id: 'a' });
  });

  it('computes totalTime via getTotalTime and passes layers', async () => {
    await encodeProject(makeProject(), [layer, layer]);
    expect(mockGetTotalTime).toHaveBeenCalledWith([layer, layer]);
  });

  it('returns a MinimalMedia shaped correctly', async () => {
    const result = await encodeProject(makeProject(), [layer]);

    expect(result).toMatchObject({
      id: 'fixed-uuid',
      duration: 10,
      filename: 'out.mp4',
      width: 1280,
      height: 720,
      userId: 'user-1',
      filePath: `${DOC}/proj-1/out.mp4`,
    });
    expect(result.title).toContain('Test Project');
  });

  it('sets nmedia.filePath from execEncode result after success', async () => {
    const result = await encodeProject(makeProject(), [layer]);
    expect(result.filePath).toBe(genResultDefaults.outputPath);
  });

  it('wires the progress callback through createFFmpeg', async () => {
    let capturedCb: any;
    mockCreateFFmpeg.mockImplementation(async (cb: any) => {
      capturedCb = cb;
      return makeFfmpegMock();
    });

    const cb = jest.fn();
    await encodeProject(makeProject(), [layer], false, cb);

    expect(capturedCb).toBeDefined();

    capturedCb({ time: 50000000, progress: 0 });
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ time: 50000000 }),
    );
  });

  it('progress callback is a no-op passthrough-safe when cb undefined', async () => {
    let capturedCb: any;
    mockCreateFFmpeg.mockImplementation(async (cb: any) => {
      capturedCb = cb;
      return makeFfmpegMock();
    });

    await encodeProject(makeProject(), [layer]);
    expect(() => capturedCb({ time: 1, progress: 0 })).not.toThrow();
  });

  it('propagates execEncode failures', async () => {
    const ffmpeg = makeFfmpegMock();
    ffmpeg.exec.mockRejectedValue(new Error('boom'));
    mockCreateFFmpeg.mockResolvedValue(ffmpeg);

    await expect(encodeProject(makeProject(), [layer])).rejects.toThrow('boom');
  });

  it('handles empty layers by skipping getTotalTime', async () => {
    await encodeProject(makeProject(), []);
    expect(mockGetTotalTime).not.toHaveBeenCalled();
  });

  it('passes totalTimeInitial (seconds), not the scaled ms value, to duration', async () => {
    const result = await encodeProject(makeProject(), [layer]);
    expect(result.duration).toBe(10);
  });
});

// =====================================================================
// exec — lifecycle and callbacks (real createFFmpeg + fake child)
// =====================================================================
describe('exec - lifecycle and callbacks (real createFFmpeg + fake child)', () => {
  const makeChild = () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    return child;
  };

  let child: any;
  let createFFmpegReal: (...args: any[]) => Promise<any>;
  const flush = () => new Promise((r) => setImmediate(r));

  beforeAll(async () => {
    child = makeChild();
    jest.doMock('child_process', () => ({
      spawn: jest.fn(() => child),
      __esModule: true,
    }));
    jest.isolateModules(() => {
      const mod = jest.requireActual('./util/createFFmpeg');
      createFFmpegReal = mod.createFFmpeg;
    });
  });

  afterAll(() => {
    jest.dontMock('child_process');
  });

  it('passes RAW stderr through to cb — time= is NOT parsed into ms×1e6 here', async () => {
    const cb = jest.fn();
    const ffmpeg = await createFFmpegReal(undefined, cb);

    const p = ffmpeg.exec(['-y']);
    await flush();

    child.stderr.emit(
      'data',
      Buffer.from(
        'frame= 100 fps=30 q=28.0 size=1024kB time=00:00:01.50 bitrate=...',
      ),
    );
    child.emit('close', 0);
    await p;

    expect(cb).toHaveBeenCalledWith(
      'frame= 100 fps=30 q=28.0 size=1024kB time=00:00:01.50 bitrate=...',
    );
  });

  it('passes non-time stderr to cb as well (no filtering at this layer)', async () => {
    const cb = jest.fn();
    const ffmpeg = await createFFmpegReal(undefined, cb);

    const p = ffmpeg.exec(['-y']);
    await flush();

    child.stderr.emit('data', Buffer.from('some random warning\n'));
    child.emit('close', 0);
    await p;

    expect(cb).toHaveBeenCalledWith('some random warning\n');
  });

  it('rejects if spawn itself fails', async () => {
    const ffmpeg = await createFFmpegReal();

    const p = ffmpeg.exec(['-y']);
    await flush();
    child.emit('error', new Error('ENOENT'));

    await expect(p).rejects.toThrow('ENOENT');
  });

  it('resolves with the child exit code on close', async () => {
    const ffmpeg = await createFFmpegReal();

    const p = ffmpeg.exec(['-y']);
    await flush();
    child.emit('close', 42);

    await expect(p).resolves.toBe(42);
  });

  it('resolves 0 on successful close', async () => {
    const ffmpeg = await createFFmpegReal();

    const p = ffmpeg.exec(['-y']);
    await flush();
    child.emit('close', 0);

    await expect(p).resolves.toBe(0);
  });
});
