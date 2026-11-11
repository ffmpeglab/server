import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { ItemsService } from '../items/items.service';
import { Task } from '../types/Task';
import { OtariClient } from '@mozilla-ai/otari';
import { TasksService } from './tasks.service';
import { RendersService } from '../renders/renders.service';
import { Item } from '../model/item.entity';
import { documentDir } from '../ffmpeg/util/util';
import { GitRepo } from '../types';
import { cloneRepo } from '../ffmpeg/util/gitClone';
import fs from 'fs';
import { commitFileAndPush } from './gitpatch';
import { openMergeRequest } from './gitmr';

const client = new OtariClient({
  platformToken: config.otariApiKey,
  apiBase: config.otariHost,
});

const extractFileContent = (
  content: string | null | undefined,
): string | null => {
  if (!content) return null;
  const fenced = content.match(/```(?:bash|sh)?\s*\n([\s\S]*?)```/);
  return fenced ? fenced[1] : null;
};

@Processor(config.queue.task)
export class TaskProcessor {
  constructor(
    private readonly itemService: ItemsService,
    private readonly taskService: TasksService,
    private readonly rendersService: RendersService,
  ) {}

  @Process('task')
  async handleTask(
    job: PgmqJob<{ taskId: string; userId: string; date: string }>,
  ) {
    const { taskId, userId } = job.message.data;
    console.info('start processing task', taskId);

		const item = await this.itemService.findOne(taskId, userId);
		if (!item?.id) throw new Error('item_not_found');
		
		if((item.item as Task).status !== "queue") throw new Error('task_is_running')

    try {
      await this.taskService.updateTaskStatus(taskId, 'progress');


      const task = item.item as Task;
      const gitRepo = task.project.editor.gitRepo as GitRepo;
      const { ref, path: codePath, platform, repoFullName } = gitRepo;
      const url = `https://${platform}.com/${repoFullName}`;
      const repoDir = `${documentDir()}/${taskId}`;

      await cloneRepo({ url, ref, dest: repoDir });

      const code = fs.readFileSync(`${repoDir}/${codePath}`, 'utf8');
      const prompt = `
##This is an ffmpeg script that can be changed, inside a repo at this path: ${codePath}
${code}

##This is the immutable project structure:
${JSON.stringify(task.project, undefined, 2)}
${JSON.stringify(task.layers, undefined, 2)}

##The user asked for the following:
${task.prompt}

##Output format
Return ONLY the complete new contents of ${codePath}, wrapped in a single
\`\`\`bash code fence. No explanation, no diff, no preamble. The file
should be a valid render.sh with all $MEDIA_N and $OUTPUT_PATH placeholders
preserved.
`;

      const response = await client.completion({
        model: task.model,
        messages: [{ role: 'user', content: prompt }],
      });

      task.response = response;
      await this.itemService.update(
        { ...item, item: { ...task, status: 'rendering' } },
        item.user_id,
      );

      const fileContent = extractFileContent(
        response.choices?.[0]?.message?.content,
      );
      if (!fileContent?.trim()) throw new Error('llm_no_file_content');

      const short = taskId.replace(/-/g, '').slice(0, 8);
      const branch = `ffmpeglab/task-${short}`;
      const commitMessage = `ffmpeglab: ${task.prompt
        .split('\n')[0]
        .slice(0, 72)}`;

      await commitFileAndPush({
        dest: repoDir,
        branch,
        filePath: codePath,
        fileContent,
        commitMessage,
        author: { name: 'ffmpeglab', email: 'info@ffmpeglab.com' },
      });

      await openMergeRequest({
        sourceBranch: branch,
        targetBranch: ref,
        platform,
        repoFullName,
        title: commitMessage,
        body: '',
      });

      // Write the render with gitRepo.ref = branch. encodeProjectWithGit
      // picks it up from projectData.editor.gitRepo and skips opentenant.
      const render = await this.rendersService.writeRender(
        {
          project: {
            ...task.project,
            editor: {
              ...task.project.editor,
              gitRepo: { ...gitRepo, ref: branch },
            },
          },
          layers: task.layers,
        },
        userId,
      );
      if (!render?.id) throw new Error('render_write_failed');

      task.result = { ...(task.result || {}) };
      await this.itemService.update({ ...item, item: task }, item.user_id);

      // taskId passthrough so the render can notify us when it finishes.
      await this.rendersService.enqueRender(render.id, userId, undefined, {
        taskId,
      });
    } catch (err) {
      console.error('task err', err);
      await this.taskService.updateTaskStatus(taskId, 'error');
      throw err;
    }
  }

  /**
   * Fired by RenderProcessor after the render finishes (success or failure).
   * Terminal state for the task is derived from the render outcome.
   */
  @Process('task-complete')
  async handleTaskComplete(
    job: PgmqJob<{
      taskId: string;
      userId: string;
      renderId: string;
      status: 'done' | 'error';
      media?: Record<string, unknown>;
      error?: string;
      date: string;
    }>,
  ) {
    const { taskId, userId, renderId, status, media, error } = job.message.data;

    try {
      const item = await this.itemService.findOne(taskId, userId);
      if (!item?.id) {
        console.error('task-complete: task not found', taskId);
        return;
      }

      const task = item.item as Task;
      // task.result
      task.status = status;
      task.error = error as string;
      task.renderId = renderId;

      await this.itemService.update({ ...item, item: task }, item.user_id);
    } catch (err) {
      console.error('task-complete err', err);
      // Don't rethrow: the render is done, retrying this handler won't help.
    }
  }
}
