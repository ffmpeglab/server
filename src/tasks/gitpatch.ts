import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface CommitFileOptions {
  dest: string;
  branch: string;
  filePath: string; // relative to dest, e.g. 'ffmpeglab/render.sh'
  fileContent: string;
  commitMessage: string;
  author: { name: string; email: string };
}

export const commitFileAndPush = async ({
  dest,
  branch,
  filePath,
  fileContent,
  commitMessage,
  author,
}: CommitFileOptions): Promise<void> => {
  if (!fileContent.trim()) throw new Error('file_content_empty');

  const env = gitEnv();
  const timeoutMs = 60_000;

  // 1. Write the file into the cloned repo.
  const target = join(dest, filePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, fileContent, 'utf-8');

  // 2. Branch from current HEAD (the base ref).
  await run(['checkout', '-b', branch], { env, cwd: dest, timeoutMs });

  // 3. Stage + commit with the bot's identity (does not touch .git/config).
  await run(['add', '-A'], { env, cwd: dest, timeoutMs });
  await run(
    [
      '-c',
      `user.name=${author.name}`,
      '-c',
      `user.email=${author.email}`,
      'commit',
      '-m',
      commitMessage,
    ],
    { env, cwd: dest, timeoutMs },
  );

  // 4. Push.
  await run(['push', 'origin', `HEAD:refs/heads/${branch}`], {
    env,
    cwd: dest,
    timeoutMs: 120_000,
  });
};
export interface ApplyAndPushOptions {
  dest: string;
  branch: string;
  diff: string;
  commitMessage: string;
  author: { name: string; email: string };
}

const run = (
  args: string[],
  opts: { env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf-8');
    });
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
      settle(() => reject(new Error(`git ${args[0]} timed out`)));
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
        settle(() => resolve({ stdout, stderr }));
      }
    });
  });

const gitEnv = (): NodeJS.ProcessEnv => {
  const tokenB64 = Buffer.from(
    `x-access-token:${config.git.httpsToken}`,
  ).toString('base64');
  return {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: tmpdir(),
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${tokenB64}`,
  };
};

/**
 * Extract the first ```diff fenced block from an LLM response.
 * Returns null if no patch-like content is found.
 */
export const extractDiff = (
  content: string | null | undefined,
): string | null => {
  if (!content) return null;
  const fenced = content
    .replace('```patch', '')
    .replace('```diff', '')
    .replace('```', '')
    .replace('```', '');
  return fenced.trimEnd();
};

/**
 * Apply a unified diff to the cloned repo on a fresh branch and push it.
 * Assumes `dest` has been cloned at the base ref (HEAD = base).
 * The branch is created from HEAD, so the MR's source is one commit ahead
 * of the target.
 */
export const applyAndPush = async ({
  dest,
  branch,
  diff,
  commitMessage,
  author,
}: ApplyAndPushOptions): Promise<void> => {
  if (!diff.trim()) throw new Error('git_diff_empty');

  const env = gitEnv();
  const timeoutMs = 60_000;

  // 1. create branch from current HEAD (which is the base ref from clone)
  await run(['checkout', '-b', branch], { env, cwd: dest, timeoutMs });

  // 2. apply the diff via a temp file (avoid stdin buffering issues)
  const scratch = mkdtempSync(join(tmpdir(), 'ffgit-patch-'));
  const patchPath = join(scratch, 'patch.diff');
  try {
    writeFileSync(patchPath, diff, 'utf-8');
    await run(['apply', '--recount', '--whitespace=nowarn', patchPath], {
      env,
      cwd: dest,
      timeoutMs,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  // 3. stage + commit (identity via -c so .git/config is untouched)
  await run(['add', '-A'], { env, cwd: dest, timeoutMs });
  await run(
    [
      '-c',
      `user.name=${author.name}`,
      '-c',
      `user.email=${author.email}`,
      'commit',
      '-m',
      commitMessage,
    ],
    { env, cwd: dest, timeoutMs },
  );

  // 4. push the new branch
  await run(['push', 'origin', `HEAD:refs/heads/${branch}`], {
    env,
    cwd: dest,
    timeoutMs: 120_000,
  });
};
