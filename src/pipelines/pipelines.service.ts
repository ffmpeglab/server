import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pipeline } from '../model/pipeline.entity';
import { CreatePipelineDto, UpdatePipelineDto } from './pipelines.dto';

@Injectable()
export class PipelinesService {
  constructor(
    @InjectRepository(Pipeline)
    private pipelinesRepository: Repository<Pipeline>,
  ) {}

  async findAll(userId: string): Promise<Pipeline[]> {
    return await this.pipelinesRepository.findBy({ user_id: userId });
  }

  async findOne(id: string, userId: string): Promise<Pipeline | null> {
    return await this.pipelinesRepository.findOneBy({ id, user_id: userId });
  }

  async create(
    createPipeline: CreatePipelineDto,
    userId: string,
  ): Promise<Pipeline | null> {
    const n = await this.pipelinesRepository.insert({
      ...createPipeline,
      status: 'created',
      user_id: userId,
      date: new Date().toISOString(),
    });
    return await this.findOne(n.identifiers[0].id, userId);
  }

  async update(
    pipeline: UpdatePipelineDto,
    userId: string,
  ): Promise<Pipeline | null> {
    await this.pipelinesRepository.update(
      { id: pipeline.id, user_id: userId },
      pipeline,
    );
    return await this.findOne(pipeline.id, userId);
  }
}
