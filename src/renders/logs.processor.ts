import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { RendersService } from './renders.service';

const PROGRESS_UPDATE_THRESHLOD = 10;

@Processor(config.queue.logs)
export class LogsProcessor {
  constructor(private readonly renderService: RendersService) {}

  @Process('progress')
  async handleProgress(
    job: PgmqJob<{
      renderId: string;
      logs: string;
      progress: number;
      userId: string;
      date: string;
    }>,
  ) {
    // console.log('new logs ', job);
    try {
      const { renderId, progress, userId } = job.message.data;
      if (renderId && progress) {
        const render = await this.renderService.findOne(renderId, userId);
        if (
          render?.progress &&
          progress - render.progress > PROGRESS_UPDATE_THRESHLOD
        ) {
          await this.renderService.updateRenderProgress(renderId, progress);
        }
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
      progress: number;
      userId: string;
      date: string;
    }>,
  ) {
    // console.log('new logs ', job);
    try {
      const { renderId, logs, progress, userId, date } = job.message.data;
      if (renderId && logs?.length) {
        // console.log('renderId:' + renderId, logs);
        await this.renderService.appendLogs(renderId, logs, userId, date);
      }
      if (renderId && progress) {
        console.log('progress', progress);
      }
    } catch (err) {
      console.error('logs err', err);
    }
  }
}
