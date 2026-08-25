import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pipeline } from '../model/pipeline.entity';
import {
  CreatePipelineDto,
  TranspilerRequest,
  TranspilerResponse,
  UpdatePipelineDto,
} from './pipelines.dto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';

const pathToTranspiler = path.join(
  __dirname.replace('dist', '').replace('src', '').replace('pipelines', ''),
  'sdk/yaml/transpiler.ts',
);

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
      {
        status: pipeline.status,
        downsql: pipeline.downsql,
        upsql: pipeline.upsql,
        title: pipeline.title,
        yml: pipeline.yml,
      },
    );
    return await this.findOne(pipeline.id, userId);
  }

  async transpile(pipeline: TranspilerRequest): Promise<TranspilerResponse> {
    // console.info('transpiler');
    const id = randomUUID();
    const ymlDir = `${config.documentDir}/yml/`;
    const ymlPath = `${ymlDir}${id}.yml`;
    const sqlPath = `${config.documentDir}/sql/${id}`;
    // console.info('creating yml dir');
    await new Promise((res) => {
      const ex = fs.existsSync(ymlDir);
      if (ex) return res(1);

      fs.mkdir(ymlDir, () => {
        res(1);
      });
    });
    // console.info('creating sql dir');
    await new Promise((res) =>
      fs.mkdir(sqlPath, () => {
        res(1);
      }),
    );
    // console.info('starting transpiling');
    const files = (await new Promise((mainResolve, mainReject) => {
      fs.writeFile(ymlPath, pipeline.yml, (err) => {
        if (err) return mainReject(err);

        // console.info('after writing yml, starting transpiler');

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

        transpiler.on('close', (code) => {
          console.info('transpiler finished code:', code);
          fs.unlink(ymlPath, () => {});
          fs.readdir(sqlPath, (err, files) => {
            // console.info('readdir with result', files);
            if (err) return mainReject(err);
            const fileMap: { [key: string]: string } = {};
            Promise.all(
              files.map(
                async (fileName) =>
                  await new Promise((res) => {
                    const filePath = `${sqlPath}/${fileName}`;
                    fs.readFile(filePath, 'utf-8', (err, file) => {
                      if (err) return mainReject(err);
                      fileMap[fileName] = file;
                      fs.unlink(filePath, () => {
                        res(1);
                      });
                    });
                  }),
              ),
            ).then(() => mainResolve(fileMap));
          });
        });
      });
    })) as { [key: string]: string };

    return { files };
  }
}
