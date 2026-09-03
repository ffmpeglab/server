import {
  CodeSelection,
  EditorLayer,
  EditorProject,
  EncoderProject,
  Media,
  MinimalMedia,
} from '../types';
import { documentDir } from './util/util';
export const currentSessionId = 0;
import {
  createFFmpeg,
  CBProgressCallback,
  LogsProgressCallback,
} from './util/createFFmpeg';
import { genRenderCmd } from './util/genRenderCmd';
import { getTotalTime } from './util/getTotalTime';
import { processUserCode } from './util/processUserCode';
import { parseCommand } from './util/parseCommand';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { syncMedia } from './util/syncMedia';

const processCustomCode = (Code: string) => {
  const hasFilterComplex = Code?.search('filter_complex') > -1;
  if (hasFilterComplex) return processUserCode(Code);

  return parseCommand(Code);
};
export interface ExecCMD {
  files: (string | undefined)[];
  encoded: string[];
  outFileId: string;
  outputPath: string;
  execCmd: string[];
  mediaOut: MinimalMedia;
  cb?: CBProgressCallback;
  logs?: LogsProgressCallback;
  projectData: EditorProject;
  totalTime: number;
  ffmpeg: Awaited<ReturnType<typeof createFFmpeg>>;
  assignedMedias: { [key: string]: string };
}
export const execEncode = async (cmd: ExecCMD): Promise<string> => {
  try {
    fs.mkdirSync(`${documentDir()}/${cmd.projectData?.id}`, {
      recursive: true,
    });
  } catch (err) {
    console.error(err);
  }
  try {
    const execCode =
      cmd.projectData?.editor?.selectedCode === CodeSelection.custom &&
      typeof cmd.projectData.editor.code === 'string'
        ? processCustomCode(cmd.projectData.editor.code)
        : cmd.execCmd;

    const env = cmd.assignedMedias;
    let ncmd = '';
    if (typeof execCode === 'string') {
      ncmd = execCode;
      Object.keys(env).map((k) => {
        const value = env[k];
        ncmd = ncmd.replace('$' + k, value);
      });
    }
    const cmdProcessed =
      typeof cmd === 'string'
        ? ncmd
        : execCode?.map((arg: string | number) => {
            const key = arg.toString().replace('$', '');
            return env[key] ? env[key] : arg;
          });

    const exec = cmd.ffmpeg.exec(cmdProcessed as string[]);
    // console.info('processing', exec);
    const code = await exec;
    if (code !== 0 && code !== undefined) {
      throw new Error(`ffmpeg exited with code ${code}`);
    }
    // console.info('after exec', exec, outFileId);
    const url = `${documentDir()}/${cmd.outFileId}`;
    cmd.mediaOut.filePath = url;
    const stats = fs.statSync(cmd.outputPath);
    cmd.mediaOut.size = stats?.size;
    return cmd.outputPath;
  } catch (err) {
    console.error('encodeProject error', err);
    throw err;
  }
};

export const encodeProject = async (
  projectData: EditorProject,
  layers: EditorLayer[],
  isPrerender?: boolean,
  cb?: CBProgressCallback,
  logs?: LogsProgressCallback,
): Promise<MinimalMedia> => {
  try {
    const newMediaId = randomUUID().toString();
    const cmd: ReturnType<typeof genRenderCmd> & {
      mediaOut?: MinimalMedia;
      cb?: CBProgressCallback;
      logs?: LogsProgressCallback;
      totalTime?: number;
      ffmpeg?: Awaited<ReturnType<typeof createFFmpeg>>;
    } = genRenderCmd(projectData, layers, newMediaId);
    const files = cmd.files.filter((i) => i !== '-i');

    // console.info('encodeProject', projectData, layers, isPrerender, cmd);

    const encoded = await Promise.all(
      cmd.medias.map((media: EncoderProject) => syncMedia(media)),
    );
    const totalTimeInitial = layers?.length ? getTotalTime(layers) : 0;
    const totalMultiplier = 10000;
    const totalTime = totalTimeInitial * totalMultiplier;
    const totalTimePercent = totalTime / 100;
    const ffmpeg = await createFFmpeg(({ time }) => {
      if (!cb) return;
      const progress2 = parseFloat(
        (time / totalMultiplier / totalTimePercent).toFixed(2),
      );
      cb({ time, progress: progress2 });
    }, logs);
    cmd.files = files;
    const nmedia: MinimalMedia = {
      id: newMediaId,
      duration: totalTimeInitial,
      filename: cmd.outFileId as string,
      width: projectData.editor.width,
      height: projectData.editor.height,
      userId: projectData.userId,
      title: `${projectData.title}_${new Date().toLocaleString()}`,
    };
    cmd.encoded = encoded;
    cmd.ffmpeg = ffmpeg;
    cmd.mediaOut = nmedia;
    cmd.cb = cb;
    cmd.logs = logs;
    cmd.totalTime = totalTimeInitial;

    try {
      const media = await execEncode(cmd as ExecCMD);

      nmedia.filePath = media;
    } catch (err) {
      console.error('execEncode error', JSON.stringify(err));
      throw err;
    }

    return nmedia;
  } catch (err) {
    console.error('encodeproject error', err);
    throw err;
  }
};
