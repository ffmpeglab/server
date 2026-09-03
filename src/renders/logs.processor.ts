import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { RendersService } from './renders.service';

const PROGRESS_UPDATE_THRESHLOD = 2 * 10000;

@Processor(config.queue.logs)
export class LogsProcessor {
  constructor(private readonly renderService: RendersService) {}

  @Process('progress')
  async handleProgress(
    job: PgmqJob<{
      renderId: string;
      logs: string;
      progress: { progress: number; time: number };
      userId: string;
      date: string;
    }>,
  ) {
    try {
      const { renderId, progress } = job.message.data;

      if (renderId && progress) {
        await this.onProgress(job);
      }
    } catch (err) {
      console.error('logs err', err);
    }
  }

  @Process('logs')
  async handleLogs(
    job: PgmqJob<{
      renderId: string;
      logs: string;
      progress: { progress: number; time: number };
      userId: string;
      date: string;
    }>,
  ) {
    // console.log('new logs ', job);
    try {
      const { renderId, logs, progress, userId, date } = job.message.data;
      if (renderId && logs?.length) {
        await this.renderService.appendLogs(renderId, logs, userId, date);
        return;
      }

      if (renderId && progress) {
        await this.onProgress(job);
      }
    } catch (err) {
      console.error('logs err', err);
    }
  }

  async onProgress(
    job: PgmqJob<{
      renderId: string;
      logs: string;
      progress: { progress: number; time: number };
      userId: string;
      date: string;
    }>,
  ) {
    const { renderId, progress, userId } = job.message.data;
    const render = await this.renderService.findOne(renderId, userId);
    const diff = (render?.progress && progress.time - render?.progress) || 0;
    if (render?.progress === 100) {
      return;
    }

    if (!render?.progress || diff > PROGRESS_UPDATE_THRESHLOD)
      await this.renderService.updateRenderProgress(
        renderId,
        parseInt(progress.time.toString()),
      );
  }
}
