import { spawn } from 'node:child_process';
import { execToMilliseconds } from './genExecTime';
import fs from 'node:fs';
import { config } from '../../config';
import { documentDir } from './util';

export type CBProgressParams = { progress?: number; time: number };
export type CBProgressCallback = (progress: CBProgressParams) => void;
export type LogsProgressCallback = (line: string) => void;

const ffmpegPath = config.ffmpeg.path;

const bWrapPath = process.env.BWRAP_PATH as string;

function buildBwrapArgs(scratchDir: string, cmd: string[]): string[] {
  return [
    '--unshare-all',
    '--die-with-parent',
    '--cap-drop',
    'ALL',

    '--clearenv',
    '--setenv',
    'PATH',
    '/usr/local/bin:/usr/bin:/bin',
    '--setenv',
    'HOME',
    scratchDir,

    // binaries and libraries
    '--ro-bind',
    '/usr',
    '/usr',
    '--ro-bind-try',
    '/lib',
    '/lib',
    '--ro-bind-try',
    '/lib64',
    '/lib64',
    '--ro-bind-try',
    '/bin',
    '/bin',

    // dynamic linker — this is what fixes libdrm
    '--ro-bind-try',
    '/etc/ld.so.cache',
    '/etc/ld.so.cache',
    '--ro-bind-try',
    '/etc/ld.so.conf',
    '/etc/ld.so.conf',
    '--ro-bind-try',
    '/etc/ld.so.conf.d',
    '/etc/ld.so.conf.d',

    // libdrm data files
    '--ro-bind-try',
    '/usr/share/libdrm',
    '/usr/share/libdrm',

    '--ro-bind-try',
    '/etc/localtime',
    '/etc/localtime',

    '--proc',
    '/proc',
    '--dev',
    '/dev',

    // writable scratch — tmpfs BEFORE the bind so it doesn't shadow it
    '--tmpfs',
    '/tmp',
    '--bind',
    scratchDir,
    scratchDir,

    ffmpegPath,
    ...cmd,
  ];
}
export const createFFmpeg = async (
  cb?: CBProgressCallback,
  logsCB?: LogsProgressCallback,
) => {
  const ffmpeg = {
    exec: async (
      cmd: string[],
      env: { [key: string]: string } = {},
    ): Promise<number | string> => {
      return await new Promise((resolve, reject) => {
        const fullEnv = { ...env, FFMPEG_PATH: ffmpegPath };
        console.info({ ffmpegRun: cmd });
        const child = spawn(
          bWrapPath,
          buildBwrapArgs(documentDir() + '/' + env.RENDER_ID, cmd),
          {
            env: fullEnv,
          },
        );
        child.stdout.on('data', (data: Buffer) => {
          // console.error('native ffmpeg logs', data.toString('utf-8'));
          if (logsCB) logsCB(data.toString('utf-8'));
        });
        child.stderr.on('data', (data: Buffer) => {
          const logs = data.toString('utf-8');
          if (logs.search('time=') > -1) {
            const timeUnformatted = logs.split('time=')[1].split(' ')[0];
            const time = execToMilliseconds(timeUnformatted) * 1000000;
            // console.info('time logs', logs, time, timeUnformatted);
            cb && cb({ time });
          }
          logsCB && logsCB(data.toString('utf-8'));
        });
        child.on('error', reject);
        child.on('close', (code: number) => {
          console.info('child finished', code);
          resolve(code);
        });
      });
    },
    readAsBase64: (filePath: string) =>
      fs.readFileSync(filePath, { encoding: 'base64' }),
    readFile: (fileName: string) => fs.readFileSync(fileName),
  };
  return ffmpeg;
};
