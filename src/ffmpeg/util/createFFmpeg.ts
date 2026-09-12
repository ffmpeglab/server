import { spawn } from 'node:child_process';
import { execToMilliseconds } from './genExecTime';
import fs from 'node:fs';
import { config } from '../../config';
import path from 'node:path';
import { documentDir } from './util';

export type CBProgressParams = { progress?: number; time: number };
export type CBProgressCallback = (progress: CBProgressParams) => void;
export type LogsProgressCallback = (line: string) => void;

const ffmpegPath = config.ffmpeg.path;

function buildBwrapArgs(scratchDir: string, cmd: string[]): string[] {
  // scratchDir is per-render, e.g. /tmp/ffmpeglab/<renderId>
  return [
    // fresh namespaces for user, PID, mount, UTS, IPC, cgroup, and network
    '--unshare-all',

    // kill the sandbox when the parent Node process dies
    '--die-with-parent',

    // drop all capabilities
    '--cap-drop',
    'ALL',

    // clear the environment, then re-add only what FFmpeg needs
    '--clearenv',
    '--setenv',
    'PATH',
    '/usr/bin:/bin',
    '--setenv',
    'HOME',
    scratchDir,

    // read-only system binaries (FFmpeg and its shared libs)
    '--ro-bind',
    '/usr',
    '/usr',
    '--ro-bind',
    '/lib',
    '/lib',
    '--ro-bind',
    '/lib64',
    '/lib64',
    '--ro-bind',
    '/bin',
    '/bin',

    '--proc',
    '/proc',
    '--dev',
    '/dev',

    '--bind',
    scratchDir,
    scratchDir,
    '--tmpfs',
    '/tmp',

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
        const child = spawn('bwrap', buildBwrapArgs(documentDir(), cmd), {
          env: fullEnv,
        });
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
