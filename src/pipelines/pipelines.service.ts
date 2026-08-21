import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pipeline } from '../model/pipeline.entity';
import { CreatePipelineDto, UpdatePipelineDto } from './pipelines.dto';
import fs from 'node:fs';
import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
const pathToTranspiler = path.join(
  __dirname.replace('dist', '').replace('src', ''),
  'sdk/yaml/transpiler.ts',
);

console.info({ pathToTranspiler });

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

  async transpile(pipeline: CreatePipelineDto): Promise<Pipeline | null> {
    const id = randomUUID();
    const ymlPath = `${config.documentDir}/yml/${id}.yml`;
    const sqlPath = `${config.documentDir}/sql/${id}/`;
    return new Promise((res) => {
      fs.writeFile(ymlPath, pipeline.yml, (err) => {
        const transpiler = spawn('deno', [
          'run',
          '-A',
          pathToTranspiler,
          ymlPath,
          sqlPath,
          '--svg',
        ]);

        transpiler.stdout.on('data', (data: Buffer) => {
          console.error('yml transpiler stdout', data.toString('utf-8'));
        });

        transpiler.stderr.on('data', (data: Buffer) => {
          console.error('yml transpiler stderr', data.toString('utf-8'));
        });

        transpiler.on('close', () => {
          fs.readdir(sqlPath, (err, files) => {
            const results = Promise.all(
              files.map(
                async (file) =>
                  await new Promise((res, reject) => {
                    fs.readFile(file, 'utf-8', (err, file) => {
                      if (err) return reject(err);

                      res(file);
                    });
                  }),
              ),
            );
            return results;
          });
        });
      });
    });
  }
}
