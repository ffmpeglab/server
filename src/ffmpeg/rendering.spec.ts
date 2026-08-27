import { execEncode, encodeProject } from './rendering';
import { genRenderCmd } from './util/genRenderCmd';
import { getTotalTime } from './util/getTotalTime';
import { createFFmpeg } from './util/createFFmpeg';
import { syncMedia } from './util/syncMedia';
import { processUserCode } from './util/processUserCode';
import { parseCommand, replaceEnv } from './util/parseCommand';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { mockExecuteFFmpeg } from './__mocks__/ffmpeg'; // adjust import to your mocks

jest.mock('./util/genRenderCmd');
jest.mock('./util/getTotalTime');
jest.mock('./util/createFFmpeg');
jest.mock('./util/syncMedia');
jest.mock('./util/processUserCode');
jest.mock('./util/parseCommand', () => ({
  parseCommand: jest.fn(),
  replaceEnv: jest.fn(),
}));
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
const mockReplaceEnv = replaceEnv as jest.Mock;
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
    execCmd: [
      '-i',
      '$MEDIA1',
      '-i',
      '$MEDIA_1',
      '-i',
      '$MEDIA1',
      '-y',
      'OUTPUT_PATH',
    ],
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

  it('runs ffmpeg.exec with the provided execCmd for generated code', async () => {
    const cmd = baseCmd();
    await execEncode(cmd as any);

    expect(cmd.ffmpeg.exec).toHaveBeenCalledWith(
      cmd.execCmd,
      cmd.assignedMedias,
    );
  });

  it('calls mediaOut with filePath and size from outputPath stats', async () => {
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
      mockReplaceEnv.mockImplementation((c) => c);
      mockProcessUserCode.mockReturnValue(['-crf', '20']);
      mockParseCommand.mockReturnValue(['-crf', '20']);
    });

    it('routes through replaceEnv + processUserCode when code contains filter_complex', async () => {
      const cmd = baseCmd({
        projectData: makeProject({
          selectedCode: CodeSelection.custom,
          code: '-vf "filter_complex stuff"',
        }),
      });

      await execEncode(cmd as any);

      expect(mockReplaceEnv).toHaveBeenCalledWith(
        '-vf "filter_complex stuff"',
        cmd.assignedMedias,
      );
      expect(mockProcessUserCode).toHaveBeenCalled();
      // hasFilterComplex branch returns processUserCode directly — no parseCommand
      expect(mockParseCommand).not.toHaveBeenCalled();
      expect(cmd.ffmpeg.exec).toHaveBeenCalledWith(
        ['-crf', '20'],
        cmd.assignedMedias,
      );
    });

    it('routes through processUserCode → join → parseCommand when no filter_complex', async () => {
      const cmd = baseCmd({
        projectData: makeProject({
          selectedCode: CodeSelection.custom,
          code: '-crf 20',
        }),
      });

      await execEncode(cmd as any);

      expect(mockReplaceEnv).not.toHaveBeenCalled();
      expect(mockProcessUserCode).toHaveBeenCalledWith('-crf 20');
      expect(mockParseCommand).toHaveBeenCalledWith(
        '-crf 20',
        cmd.assignedMedias,
      );
      expect(cmd.ffmpeg.exec).toHaveBeenCalledWith(
        ['-crf', '20'],
        cmd.assignedMedias,
      );
    });

    it('custom-code branch IGNORES the generated execCmd entirely', async () => {
      const cmd = baseCmd({
        projectData: makeProject({
          selectedCode: CodeSelection.custom,
          code: '-y out.mp4',
        }),
      });
      await execEncode(cmd as any);
      // only the parsed user code reaches exec:
      expect(cmd.ffmpeg.exec).toHaveBeenCalledTimes(1);
      expect((cmd.ffmpeg.exec as jest.Mock).mock.calls[0][0]).toEqual([
        '-crf',
        '20',
      ]);
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
      // must fail fast BEFORE statSync ever runs:
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
    expect(result.filename).toBe('out.mp4'); // sanity

    // Implementation REASSIGNES cmd.files (cmd.files = files),
    // mutating the same object genRenderCmd returned. Pin that behavior:
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

    await encodeProject(makeProject(), [layer]); // no cb
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
    expect(result.duration).toBe(10); // seconds, per current contract
  });
});

// =====================================================================
// exec — lifecycle and callbacks
//
// These tests exercise the REAL createFFmpeg implementation against a
// fake child process, so close/stdout/stderr/error wiring and time=
// parsing are covered end-to-end. Loaded via isolateModules so the
// module-level jest.mock above does not apply here.
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

  it('⚠️ passes RAW stderr through to cb — time= is NOT parsed into ms×1e6 here', async () => {
    // Documents CURRENT behavior: the progress cb receives the unmodified
    // stderr chunk. If parsing happens elsewhere (e.g. caller side), this
    // test is your guardrail that createFFmpeg itself stays a passthrough.
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
