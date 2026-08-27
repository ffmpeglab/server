import { EventEmitter } from 'node:events';
import { spawn } from 'child_process';
import { createFFmpeg } from './createFFmpeg';
jest.mock('child_process');
jest.mock('./util', () => ({
  documentDir: jest.fn(() => '/tmp/docdir'),
}));

const mockSpawn = spawn as unknown as jest.Mock;

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

let child: FakeChild;
beforeEach(() => {
  jest.clearAllMocks();
  child = new FakeChild();
  mockSpawn.mockReturnValue(child);
});

const flush = () => new Promise((r) => setImmediate(r));

describe('await createFFmpeg', () => {
  describe('exec - argument handling', () => {
    it('spawns the ffmpeg binary', async () => {
      const p = (await createFFmpeg()).exec(['-y']);
      await flush();
      child.emit('close', 0);

      await p;
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('exec - lifecycle and callbacks', () => {
    it('resolves with the exit code on close', async () => {
      const p = (await createFFmpeg()).exec(['-y']);
      await flush();
      child.emit('close', 42);

      await expect(p).resolves.toBe(42);
    });

    it('resolves with 0 on success', async () => {
      const p = (await createFFmpeg()).exec(['-y']);
      await flush();
      child.emit('close', 0);

      await expect(p).resolves.toBe(0);
    });

    it('forwards stdout data to logsCB (bound at createFFmpeg, not exec)', async () => {
      const logsCB = jest.fn();
      const ffmpeg = await createFFmpeg(undefined, logsCB);
      const p = ffmpeg.exec(['-y'], {});
      await flush();

      child.stdout.emit('data', Buffer.from('hello stdout'));
      child.emit('close', 0);
      await p;

      expect(logsCB).toHaveBeenCalledWith('hello stdout');
    });

    it('forwards stderr data to logsCB too', async () => {
      const logsCB = jest.fn();
      const ffmpeg = await createFFmpeg(undefined, logsCB);
      const p = ffmpeg.exec(['-y'], {});
      await flush();

      child.stderr.emit('data', Buffer.from('frame= 100 fps=30'));
      child.emit('close', 0);
      await p;

      expect(logsCB).toHaveBeenCalledWith('frame= 100 fps=30');
    });

    it('parses time= from stderr and reports progress to cb with ms×1e6', async () => {
      const progressCB = jest.fn();
      const ffmpeg = await createFFmpeg(progressCB);
      const p = ffmpeg.exec(['-y'], {});
      await flush();

      child.stderr.emit(
        'data',
        Buffer.from(
          'frame= 100 fps=30 q=28.0 size=1024kB time=00:00:01.50 bitrate=...',
        ),
      );
      child.emit('close', 0);
      await p;

      // execToMilliseconds('00:00:01.50') === 1500 → ×1000000
      expect(progressCB).toHaveBeenCalledWith({
        time: 1_500_000,
      });
    });

    it('does not invoke progress cb for stderr without time=', async () => {
      const progressCB = jest.fn();
      const ffmpeg = await createFFmpeg(progressCB);
      const p = ffmpeg.exec(['-y'], {});
      await flush();

      child.stderr.emit('data', Buffer.from('random warning\n'));
      child.emit('close', 0);
      await p;

      expect(progressCB).not.toHaveBeenCalled();
    });

    it('rejects if spawn itself fails', async () => {
      const p = (await createFFmpeg()).exec(['-y']);
      await flush();
      child.emit('error', new Error('ENOENT'));

      await expect(p).rejects.toThrow('ENOENT');
    });
  });
});
