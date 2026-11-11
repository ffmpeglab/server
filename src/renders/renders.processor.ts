import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { RendersService } from './renders.service';
import { encodeProjectWithGit } from '../ffmpeg/rendering';
import { InjectQueue, PgmqQueue } from 'nestjs-pgmq';
import { uploadJobResult } from './uploadJobResult';

@Processor(config.queue.name)
export class RenderProcessor {
  constructor(
    private readonly renderService: RendersService,
    @InjectQueue(config.queue.logs)
    private readonly logsQueue: PgmqQueue,
    @InjectQueue(config.queue.task)
    private readonly taskQueue: PgmqQueue,
  ) {}

  @Process('render')
  async handleRender(
    job: PgmqJob<{
      renderId: string;
      userId: string;
      bucket?: string;
      outputPath?: string;
      runId?: string;
      taskId?: string;
    }>,
  ) {
    const { renderId, userId, bucket, outputPath, runId, taskId } =
      job.message.data;
    const render = await this.renderService.findOne(renderId, userId);

    try {
      await this.renderService.updateRenderStatus(renderId, 'rendering');

      const encoding = await encodeProjectWithGit(
        render!.data.project,
        render!.data.layers,
        false,
        (progress) =>
          this.logsQueue.add('progress', {
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
        renderId,
        userId,
      );

      await this.renderService.updateRenderStatus(renderId, 'upload');
      const result = await uploadJobResult({
        renderId,
        media: encoding,
        userId,
        bucket: render?.public ? config.publicBucket : bucket,
        outputPath,
        runId,
      });

      if (result?.id) {
        await this.renderService.updateMediaResult(renderId, {
          ...result,
          userId,
        });
        await this.renderService.updateRenderStatus(renderId, 'done');

        if (taskId) {
          await this.taskQueue.add('task-complete', {
            taskId,
            userId,
            renderId,
            status: 'done',
            media: result,
            date: new Date().toISOString(),
          });
        }
      } else {
        await this.renderService.updateRenderStatus(renderId, 'error');

        if (taskId) {
          await this.taskQueue.add('task-complete', {
            taskId,
            userId,
            renderId,
            status: 'error',
            error: 'upload_failed',
            date: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('render failed', renderId, err);

      this.logsQueue.add('logs', {
        renderId,
        logs: (err as Error)?.message || JSON.stringify(err),
        userId,
        date: new Date().toISOString(),
      });

      await this.renderService.updateRenderStatus(renderId, 'error');

      if (taskId) {
        await this.taskQueue.add('task-complete', {
          taskId,
          userId,
          renderId,
          status: 'error',
          error: (err as Error)?.message ?? String(err),
          date: new Date().toISOString(),
        });
      }
    }
  }
}
