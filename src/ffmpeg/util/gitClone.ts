import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../config';
import { acceptGitHubInvitesIfNeeded } from './acceptGithubInvites';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export interface CloneOptions {
  url: string;
  ref: string;
  dest: string;
}

const run = (
  args: string[],
  opts: { env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number },
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf-8');
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle(() =>
        reject(new Error(`git ${args[0]} timed out after ${opts.timeoutMs}ms`)),
      );
    }, opts.timeoutMs);

    child.on('error', (err) => settle(() => reject(err)));
    child.on('exit', (code, signal) => {
      if (signal) {
        settle(() => reject(new Error(`git ${args[0]} killed by ${signal}`)));
      } else if (code !== 0) {
        settle(() =>
          reject(new Error(`git ${args[0]} exited ${code}: ${stderr.trim()}`)),
        );
      } else {
        settle(resolve);
      }
    });
  });

const dirSize = async (dir: string): Promise<number> => {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
};

export const cloneRepo = async ({
  url,
  ref,
  dest,
}: CloneOptions): Promise<void> => {
  if (!config.git.httpsToken) {
    throw new Error('git_not_configured: GIT_HTTPS_TOKEN missing');
  }

  try {
    await acceptGitHubInvitesIfNeeded(url);
  } catch (err) {
    console.error('github accept invite error', err);
  }

  rmSync(dest, { recursive: true, force: true });

  const scratch = mkdtempSync(join(tmpdir(), 'ffgit-'));

  try {
    const tokenB64 = Buffer.from(
      `x-access-token:${config.git.httpsToken}`,
    ).toString('base64');

    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: scratch,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${tokenB64}`,
    };
    const timeoutMs = config.git.cloneTimeoutMs ?? 5 * 60 * 1000;
    const maxBytes = config.git.maxRepoBytes ?? 500 * 1024 * 1024;

    const safe = (...args: string[]): string[] => [
      '-c',
      'protocol.ext.allow=never',
      '-c',
      'protocol.file.allow=never',
      ...args,
    ];

    if (SHA_PATTERN.test(ref)) {
      await mkdir(dest, { recursive: true });
      await run(safe('init', '--quiet', dest), {
        env,
        cwd: scratch,
        timeoutMs,
      });
      await run(safe('remote', 'add', 'origin', url), {
        env,
        cwd: dest,
        timeoutMs,
      });
      try {
        await run(safe('fetch', '--depth=1', 'origin', ref), {
          env,
          cwd: dest,
          timeoutMs,
        });
        await run(safe('checkout', '--quiet', 'FETCH_HEAD'), {
          env,
          cwd: dest,
          timeoutMs,
        });
      } catch {
        await run(safe('fetch', 'origin'), {
          env,
          cwd: dest,
          timeoutMs: timeoutMs * 3,
        });
        await run(safe('checkout', '--quiet', ref), {
          env,
          cwd: dest,
          timeoutMs,
        });
      }
    } else {
      await run(
        safe(
          'clone',
          '--depth=1',
          '--single-branch',
          '--branch',
          ref,
          '--recurse-submodules=no',
          url,
          dest,
        ),
        { env, cwd: scratch, timeoutMs },
      );
    }

    const total = await dirSize(dest);
    if (total > maxBytes) {
      throw new Error(`repo_too_large: ${total} bytes (max ${maxBytes})`);
    }
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw err;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};
