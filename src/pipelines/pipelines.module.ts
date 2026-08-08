import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelinesService } from './pipelines.service';
import { PipelinesController } from './pipelines.controller';
import { AuthService } from '../auth/auth.service';
import { Pipeline } from '../model/pipeline.entity';
import { ApiKey } from '../model/apikey.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pipeline]),
    TypeOrmModule.forFeature([ApiKey]),
  ],
  providers: [AuthService, PipelinesService],
  controllers: [PipelinesController],
})
export class PipelinesModule {}
