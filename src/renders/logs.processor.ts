import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { RendersService } from './renders.service';

@Processor(config.queue.logs)
export class LogsProcessor {
  constructor(private readonly renderService: RendersService) {}
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
