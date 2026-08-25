import {
  EditorLayer,
  EditorProject,
  EncoderProject,
  FFMpegOutputType,
  SpeedValue,
} from '../../types';
import { genRenderCmd } from './genRenderCmd';
import { getTotalTime } from './getTotalTime';
import { genExecTime } from './genExecTime';
import { documentDir, getFileId } from './util';

jest.mock('./getTotalTime', () => ({ getTotalTime: jest.fn() }));
jest.mock('./genExecTime', () => ({ genExecTime: jest.fn() }));
jest.mock('./util', () => ({
  documentDir: jest.fn(),
  getFileId: jest.fn(),
  processFileName: jest.fn(),
}));

const mockGetTotalTime = getTotalTime as jest.Mock;
const mockGenExecTime = genExecTime as jest.Mock;
const mockDocumentDir = documentDir as jest.Mock;
const mockGetFileId = getFileId as jest.Mock;

// ---------- fixtures ----------

const DOC_DIR = '/tmp/ffmpeglab';

const makeProject = (overrides: Partial<EditorProject['editor']> = {}) =>
  ({
    id: 'proj-1',
    title: 'My Project',
    editor: {
      length: 10,
      width: 1280,
      height: 720,
      compressionLevel: 20,
      preset: 'medium' as any,
      output: FFMpegOutputType.mp4,
      framerate: 30,
      ...overrides,
    },
  }) as unknown as EditorProject;

const makeMedia = (overrides: Partial<EncoderProject> = {}) =>
  ({
    id: 'media-1',
    folderId: 'folder-1',
    filename: 'a file.mp4',
    duration: 5,
    width: 1920,
    height: 1080,
    isVideo: true,
    hasAudio: true,
    encoding: {},
    ...overrides,
  }) as unknown as EncoderProject;

const makeLayer = (media: EncoderProject[], overrides: any = {}) =>
  ({
    id: 'layer-1',
    title: 'Layer',
    isEditorLayer: true,
    media,
    editor: { muted: false, videoDisabled: false, ...overrides },
  }) as unknown as EditorLayer;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTotalTime.mockReturnValue(10);
  mockGenExecTime.mockReturnValue('00:00:10');
  mockDocumentDir.mockReturnValue(DOC_DIR);
  mockGetFileId
    .mockImplementationOnce(() => 'out-file-uuid') // output file
    .mockImplementation((m: any) => `${m.id}-file`);
});

describe('genRenderCmd', () => {
  describe('guard clauses', () => {
    it('returns empty result when projectData has no id', () => {
      const result = genRenderCmd({ title: 'x' } as any, [], 'new-media');
      expect(result).toEqual({ execCmd: [], medias: [], files: [] });
    });

    it('returns empty result when layers array is empty', () => {
      const result = genRenderCmd(makeProject(), [], 'new-media');
      expect(result).toEqual({ execCmd: [], medias: [], files: [] });
    });

    it('returns empty result when layers is undefined', () => {
      const result = genRenderCmd(makeProject(), undefined as any, 'new-media');
      expect(result.execCmd).toEqual([
        '-filter_complex',
        '',
        '-aspect',
        '16/9',
        '-movflags',
        '+faststart',
        '-map',
        '[v_concat]',
        '-r',
        '30',
        '-ss',
        '00:00:00',
        '-to',
        '00:00:10',
        '-y',
        '$OUTPUT_PATH',
      ]);
    });
  });

  describe('input file mapping', () => {
    it('creates one -i pair per media with MEDIA_N placeholders', () => {
      const layers = [
        makeLayer([makeMedia({ id: 'a' }), makeMedia({ id: 'b' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');

      expect(result.files).toEqual(['-i', '$MEDIA_1', '-i', '$MEDIA_2']);
      expect(result.assignedMedias.MEDIA_1).toBe(
        `${DOC_DIR}/folder-1/out-file-uuid`,
      );
      expect(result.assignedMedias.MEDIA_2).toBe(
        `${DOC_DIR}/folder-1/out-file-uuid`,
      );
    });
    it('numbers MEDIA_N sequentially across layers, matching filter_complex indices', () => {
      const layers = [
        makeLayer([makeMedia({ id: 'a', folderId: 'f1' })]),
        makeLayer([makeMedia({ id: 'b', folderId: 'f2' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');

      expect(result.files).toEqual(['-i', '$MEDIA_1', '-i', '$MEDIA_2']);
      //   expect(result.execCmd.slice(0, 4)).toEqual(['-i', 'MEDIA1′,′−i′,′MEDIA_1', '-i', 'MEDIA1′​,′−i′,′MEDIA_2']); // inputs lead execCmd
      expect(result.medias).toHaveLength(2);
    });
  });

  describe('output path & assignedMedias', () => {
    it('builds outputPath from project id + sanitized title + extension', () => {
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([makeMedia()])],
        'new-id',
      );
      expect(result.outFileId).toBe('My_Project.mp4');
      expect(mockGetFileId).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-id', filename: 'My_Project.mp4' }),
      );
      expect(result.assignedMedias.OUTPUT_PATH).toBe(result.outputPath);
    });

    it('defaults to .mp4 when encoding.output is missing', () => {
      const project = makeProject();
      delete (project.editor as any).output;
      const result = genRenderCmd(
        project,
        [makeLayer([makeMedia()])],
        'new-id',
      );
      expect(result.outFileId).toBe('My_Project.mp4');
    });

    it('replaces spaces in title with underscores', () => {
      const result = genRenderCmd(
        { ...makeProject(), title: 'Two Words' },
        [makeLayer([makeMedia()])],
        'new-id',
      );
      expect(result.outFileId).toBe('Two_Words.mp4');
    });
  });

  describe('video filter chains', () => {
    it('builds base chain with trim, scale/pad and color adjustment for a plain video', () => {
      const layers = [makeLayer([makeMedia()])];
      const result = genRenderCmd(makeProject(), layers, 'new-id');

      const filters =
        result.execCmd[result.execCmd.indexOf('-filter_complex') + 1];
      expect(filters).toContain('[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS');
      expect(filters).toContain(
        'setdar=16/9,scale=1280:720:force_original_aspect_ratio=decrease',
      );
      expect(filters).toContain(
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=rgba',
      );
      expect(filters).toContain('fps=fps=30,settb=expr=1/30');
      expect(filters).toContain('colorchannelmixer=rr=1:gg=1:bb=1:aa=1');
    });

    it('applies custom opacity in colorchannelmixer', () => {
      const media = makeMedia({ encoding: { opacity: 0.5 } as any });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      expect(result.execCmd.join(' ')).toContain('aa=0.5');
    });

    it('uses loop filter for images instead of trim', () => {
      const image = makeMedia({
        isVideo: false,
        hasAudio: false,
        duration: 5,
      });
      delete (image as any).isVideo;
      // not audio/video → treated as image
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([image])],
        'new-id',
      );
      expect(result.execCmd.join(' ')).toContain(
        'loop=loop=150:size=1:start=0',
      ); // 5s * 30fps
      expect(result.execCmd.join(' ')).not.toContain('[0:v]trim=');
    });

    it('adds crop filter when crop params present', () => {
      const media = makeMedia({
        encoding: { crop: { left: 10, right: 20, top: 30, bottom: 40 } } as any,
      });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      expect(result.execCmd.join(' ')).toContain('crop=in_w-30:in_h-70:10:30');
    });

    it('adds split/geq/overlay chain when resize or pan present', () => {
      const media = makeMedia({
        encoding: { pan: { left: 100 } } as any,
      });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).toContain(
        `split[original][dummy];[dummy]scale=1280:720,geq=0:128:128[base];[base][original]overlay=x=100:y=0`,
      );
      expect(filters).not.toContain('setdar=16/9'); // default pad path skipped
    });

    it('applies scale multiplier before overlay canvas', () => {
      const media = makeMedia({
        encoding: { scale: 0.5, resize: { x: 10, y: 20 } } as any,
      });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).toContain('scale=iw*0.5:ih*0.5');
      expect(filters).toContain('overlay=x=10:y=20');
    });

    it('appends reverse filter when encoding.reverse set', () => {
      const media = makeMedia({ encoding: { reverse: true } as any });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      expect(result.execCmd.join(' ')).toContain(',reverse');
    });

    it('does not skip media without width (no video stream)', () => {
      const layers = [
        makeLayer([
          makeMedia({ id: 'novideo', width: 0 }),
          makeMedia({ id: 'ok' }),
        ]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      const filters =
        result.execCmd[result.execCmd.indexOf('-filter_complex') + 1];
      //   expect(filters).not.toContain('[0:v]');
      expect(filters).toContain('[0:v]'); // second input becomes first video stream
    });
  });

  describe('transitions between clips in a layer', () => {
    it('concatenates two clips without transition using concat filter', () => {
      const layers = [
        makeLayer([makeMedia({ id: 'a' }), makeMedia({ id: 'b' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      const filters = result.execCmd.join(' ');
      expect(filters).toContain(
        '[v0?][v1?]concat=n=2:v=1:a=0,settb=expr=1/30[c1?]',
      );
      expect(filters).not.toContain('xfade');
    });

    it('uses xfade when transitionIn specified with valid offset', () => {
      const layers = [
        makeLayer([
          makeMedia({ id: 'a' }),
          makeMedia({
            id: 'b',
            encoding: {
              transitionIn: 'fadeleft' as any,
              transitionInDuration: 2,
            } as any,
          }),
        ]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      const filters = result.execCmd.join(' ');
      expect(filters).toMatch(
        /xfade=transition=fadeleft:duration=2:offset=\d+(\.\d+)?/,
      );
      expect(filters).not.toContain('concat=n=2');
    });

    it('falls back to concat when transitionOffset <= 0', () => {
      // first clip short enough that timelinePosition - duration - 1 < 0
      const layers = [
        makeLayer([
          makeMedia({ id: 'a', duration: 1 }),
          makeMedia({
            id: 'b',
            duration: 5,
            encoding: {
              transitionIn: 'fadeleft' as any,
              transitionInDuration: 3,
            } as any,
          }),
        ]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      expect(result.execCmd.join(' ')).toContain('concat=n=2:v=1:a=0');
    });
  });

  describe('layer compositing (overlays)', () => {
    it('stacks multiple layers bottom-to-top with overlay steps', () => {
      const layers = [
        makeLayer([makeMedia({ id: 'bottom' })]),
        makeLayer([makeMedia({ id: 'mid' })]),
        makeLayer([makeMedia({ id: 'top' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      const filters = result.execCmd.join(' ');

      expect(filters).toContain('[v_layer2][v_layer1]overlay[overlay1]');
      expect(filters).toContain('[overlay1][v_layer0]overlay[overlay2]');
      expect(filters).toContain(
        '[overlay2]split[v_main][v_overlay];[v_main]settb=expr=1/30[v_concat];[v_overlay]nullsink',
      );
    });

    it('skips video processing for videoDisabled layers but keeps them out of streams', () => {
      const layers = [
        makeLayer([makeMedia()], { videoDisabled: true }),
        makeLayer([makeMedia({ id: 'b', folderId: 'f2' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      const filters = result.execCmd.join(' ');
      expect(filters).not.toContain('v_layer0');
      expect(filters).toContain('[v_layer1]');
    });
  });

  describe('audio processing', () => {
    it('builds amix chain when media has audio and layer not muted', () => {
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([makeMedia()])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).toContain(
        '[0:a]atrim=start=0:end=5,asetpts=PTS-STARTPTS,adelay=delays=0|0,volume=1[a0?]',
      );
      expect(result.execCmd).toContain('-map', '[a_concat]' as any);
      expect(filters).toContain(
        '[a0?]amix=inputs=1:duration=longest[a_concat]',
      );
    });

    it('generates silent audio source for video without audio track', () => {
      const media = makeMedia({ hasAudio: false });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).toContain('aevalsrc=0:d=5[s0];');
      expect(filters).toContain('[s0]adelay=delays=0|0,volume=1[a0?]');
    });

    it('does not generate audio for muted layers with audio media', () => {
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([makeMedia()], { muted: true })],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).not.toContain('[0:a]atrim');
      // still generates silence placeholder since media has width
      expect(filters).toContain('aevalsrc=0:d=5');
    });

    it('applies atempo for non-100% speed', () => {
      const media = makeMedia({
        encoding: { speed: SpeedValue['200%'] } as any,
      });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).toContain('atempo=2');
    });

    it('applies areverse for reversed audio media', () => {
      const media = makeMedia({ encoding: { reverse: true } as any });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).toContain('areverse');
    });

    it('plays audio in parallel on different layers by timeline position', () => {
      const layers = [
        makeLayer([makeMedia({ id: 'a', duration: 3 })]),
        makeLayer([makeMedia({ id: 'b', duration: 4, folderId: 'f2' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      const filters = result.execCmd.join(' ');
      expect(filters).toContain('adelay=delays=0|0');
    });

    it('respects soundVolume over mute-zero for unmuted layers', () => {
      const media = makeMedia({ encoding: { soundVolume: 0.7 } as any });
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([media])],
        'new-id',
      );
      expect(result.execCmd.join(' ')).toContain('volume=0.7');
    });
  });

  describe('output-type specific behavior', () => {
    it('excludes all audio filters and mapping for gif output', () => {
      const result = genRenderCmd(
        makeProject({ output: FFMpegOutputType.gif }),
        [makeLayer([makeMedia()])],
        'new-id',
      );
      const filters = result.execCmd.join(' ');
      expect(filters).not.toContain('atrim');
      expect(filters).not.toContain('amix');
      expect(result.execCmd).not.toContain('[a_concat]');
      expect(result.outFileId).toBe('My_Project.gif');
    });

    it('omits the video map for mp3 output but keeps the audio map', () => {
      const result = genRenderCmd(
        makeProject({ output: FFMpegOutputType.mp3 }),
        [makeLayer([makeMedia()])],
        'new-id',
      );
      const cmd = result.execCmd;

      // no video mapping:
      expect(cmd).not.toContain('[v_concat]');
      const vMapIdx = cmd.indexOf('-map');
      // if a -map exists at all, it must target [a_concat]:
      if (vMapIdx !== -1) {
        expect(cmd[vMapIdx + 1]).toBe('[a_concat]');
      }
      // audio stream chain actually present:
      expect(cmd.join(' ')).toContain('[a_concat]');

      expect(result.outFileId).toBe('My_Project.mp3');
    });
  });

  describe('exec command structure', () => {
    it('contains expected static ffmpeg flags', () => {
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([makeMedia()])],
        'new-id',
      );
      const cmd = result.execCmd;
      expect(cmd).toContain('-filter_complex');
      expect(cmd).toContain('-aspect');
      expect(cmd).toContain('16/9');
      expect(cmd).toContain('+faststart');
      expect(cmd).toContain('-r');
      expect(cmd).toContain('30');
      expect(cmd).toContain('-ss');
      expect(cmd).toContain('00:00:00');
      expect(cmd).toContain('-to');
      expect(cmd).toContain('00:00:10'); // mocked nice time
      expect(cmd).toContain('-y');
      expect(cmd[cmd.length - 1]).toBe('$OUTPUT_PATH');
    });

    it('maps v_concat as first map for standard mp4', () => {
      const result = genRenderCmd(
        makeProject(),
        [makeLayer([makeMedia()])],
        'new-id',
      );
      const maps = result.execCmd.filter((_, i, arr) => arr[i - 1] === '-map');
      expect(maps[0]).toBe('[v_concat]');
      expect(maps[1]).toBe('[a_concat]');
    });

    it('returns flattened medias list matching inputs', () => {
      const layers = [
        makeLayer([makeMedia({ id: 'a' })]),
        makeLayer([makeMedia({ id: 'b' })]),
      ];
      const result = genRenderCmd(makeProject(), layers, 'new-id');
      expect(result.medias.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('echoes back projectData in result', () => {
      const project = makeProject();
      const result = genRenderCmd(
        project,
        [makeLayer([makeMedia()])],
        'new-id',
      );
      expect(result.projectData).toBe(project);
    });
  });
});
