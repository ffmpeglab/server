import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RendersService } from './renders.service';
import { RendersController } from './renders.controller';
import { Render } from '../model/render.entity';
import { config } from '../config';
import { RenderProcessor } from './renders.processor';
import { AuthService } from '../auth/auth.service';
import { ApiKey } from '../model/apikey.entity';
import { ResultProcessor } from './result.processor';
import { LogsProcessor } from './logs.processor';
import { LogPiece } from '../model/logpiece.entity';

const optionalProviders = [
  ...(config.queue.isLogsRunner ? [LogsProcessor] : []),
  ...(config.queue.isFileRunner ? [ResultProcessor] : []),
  ...(config.queue.isRenderRunner ? [RenderProcessor] : []),
];
@Module({
  imports: [
    TypeOrmModule.forFeature([Render]),
    TypeOrmModule.forFeature([ApiKey]),
    TypeOrmModule.forFeature([LogPiece]),
  ],
  providers: [AuthService, RendersService, ...optionalProviders],
  controllers: [RendersController],
})
export class RendersModule {}
