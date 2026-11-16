import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../model/item.entity';
import { Permission } from '../types';
import { Role } from '../model/roles.entity';
import { InjectQueue, PgmqQueue } from 'nestjs-pgmq';
import { config } from '../config';
import { Task } from '../types/Task';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Item)
    private items: Repository<Item>,
    @InjectRepository(Role)
    private roles: Repository<Role>,
    @InjectQueue(config.queue.task)
    private readonly queue: PgmqQueue,
  ) {}

  async updateTaskStatus(
    itemId: string,
    status: 'queue' | 'done' | 'progress' | 'error',
  ) {
    const item = await this.items.findOneBy({ id: itemId });
    await this.items.update(
      { id: itemId },
      { ...item, item: { ...item?.item, status } },
    );
  }

  async createTask(item: Item) {
    const task = item.item as Task;

    if (task.status && task.status !== 'created') {
      throw new Error('invalid_task_status');
    }

    const repo = task.project?.editor?.gitRepo;

    if (!repo) {
      throw new Error('no_repo_connected');
    }

    await this.queue.add(
      config.queue.task,
      {
        taskId: item.id,
        userId: item.user_id,
      },
      { headers: { retryCount: 1 } },
    );

    await this.updateTaskStatus(item.id, 'queue');

    return await this.items.findOneBy({ id: item.id });
  }

  async runTask(itemId: string, userId: string): Promise<Item | null> {
    const item = await this.items.findOneBy({ id: itemId });

    if (!item?.id) {
      throw new Error('item_not_found');
    }

    if (item?.user_id === userId) {
      return this.createTask(item);
    }

    const permission = await this.roles.findOneBy({
      item: itemId,
      user_id: userId,
    });
    if (
      permission &&
      [Permission.w, Permission.rw].includes(permission.permission)
    ) {
      return this.createTask(item);
    }
    throw new Error('no_permission_found');
  }
}
