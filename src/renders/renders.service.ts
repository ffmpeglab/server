import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue, PgmqQueue } from 'nestjs-pgmq';
import { MoreThan, Repository } from 'typeorm';
import { Render } from '../model/render.entity';
import { MinimalMedia, RenderData } from '../types';
import { config } from '../config';
import { LogPiece } from '../model/logpiece.entity';

@Injectable()
export class RendersService {
  constructor(
    @InjectRepository(Render)
    private rendersRepository: Repository<Render>,
    @InjectRepository(LogPiece)
    private logRepository: Repository<LogPiece>,
    @InjectQueue(config.queue.name)
    private readonly queue: PgmqQueue,
  ) {}

  async findAll(userId: string): Promise<Render[]> {
    return (await this.rendersRepository.findBy({ user_id: userId })).map(
      (render) => {
        render.data = {} as Render['data'];
        return render;
      },
    );
  }

  async findOne(id: string, userId: string): Promise<Render | null> {
    return this.rendersRepository.findOneBy({ id, user_id: userId });
  }

  async writeRender(render: RenderData, userId: string) {
    const n = await this.rendersRepository.insert({
      title: render.project.title,
      project: render.project.id,
      status: 'created',
      data: render,
      public: false,
      user_id: userId,
      progress: 0,
      logs: '',
      date: new Date().toISOString(),
      result: {},
    });
    return await this.findOne(n.identifiers[0].id, userId);
  }

  async updateMediaResult(renderId: string, media: MinimalMedia) {
    await this.rendersRepository.update({ id: renderId }, { result: media });
    return await this.findOne(renderId, media.userId);
  }

  async updateRenderStatus(
    renderId: string,
    status: 'done' | 'rendering' | 'error' | 'queue',
  ) {
    await this.rendersRepository.update({ id: renderId }, { status });
    return await this.rendersRepository.findOneBy({ id: renderId });
  }

  async findAllRendersForProject(
    projectId: string,
    userId: string,
  ): Promise<Render[]> {
    return (
      await this.rendersRepository.findBy({
        user_id: userId,
        project: projectId,
      })
    ).map((render) => {
      render.data = {} as Render['data'];
      return render;
    });
  }

  async appendLogs(
    renderId: string,
    logs: string,
    userId: string,
    date: string,
  ) {
    return await this.logRepository.insert({
      logs,
      render: renderId,
      user_id: userId,
      date,
    });
  }

  async enqueRender(renderId: string, userId: string, bucket?: string) {
    const queueItem = await this.queue.add(
      'render',
      {
        renderId,
        userId,
        bucket,
      },
      { headers: { retryCount: 1 } },
    );
    await this.updateRenderStatus(renderId, 'queue');
    return queueItem;
  }

  async getRenderLogs(
    renderId: string,
    userId: string,
    from: string,
    direction: 'ASC' | 'DESC',
  ) {
    const logs = await this.logRepository.find({
      where: {
        render: renderId,
        user_id: userId,
        date: MoreThan(new Date(from)),
      },
      order: { date: { direction: direction || 'ASC' } },
    });
    return { logs };
  }
}
