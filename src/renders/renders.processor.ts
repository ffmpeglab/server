import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { RendersService } from './renders.service';
import { encodeProject } from '../ffmpeg/rendering';
import { InjectQueue, PgmqQueue } from 'nestjs-pgmq';

@Processor(config.queue.name)
export class RenderProcessor {
  constructor(
    private readonly renderService: RendersService,
    @InjectQueue(config.queue.logs)
    private readonly logsQueue: PgmqQueue,
    @InjectQueue(config.queue.file)
    private readonly fileQueue: PgmqQueue,
  ) {}
  @Process('render')
  async handleRender(
    job: PgmqJob<{
      renderId: string;
      userId: string;
      bucket?: string;
      outputPath?: string;
      runId?: string;
    }>,
  ) {
    // console.log('starting render ', job);
    const { renderId, userId, bucket, outputPath, runId } = job.message.data;
    const render = await this.renderService.findOne(renderId, userId);
    // console.log('start encoding', render);
    try {
      await this.renderService.updateRenderStatus(renderId, 'rendering');
      const encoding = await encodeProject(
        render!.data.project,
        render!.data.layers,
        false,
        (progress) =>
          this.logsQueue.add('logs', {
            renderId,
            progress,
            userId,
            date: new Date().toISOString(),
          }),
        (logs) =>
          this.logsQueue.add('logs', {
            renderId,
            logs,
            userId,
            date: new Date().toISOString(),
          }),
      );
      this.fileQueue.add('file', {
        renderId,
        media: encoding,
        userId,
        bucket,
        outputPath,
        runId,
      });
      await this.renderService.updateRenderStatus(renderId, 'done');
    } catch (err) {
      console.error('rnder failed', renderId, err);
      await this.renderService.updateRenderStatus(renderId, 'error');
    }
  }
}
