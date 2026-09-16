import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RendersService } from '../renders/renders.service';
import { PublicController } from './public.controller';
import { Render } from '../model/render.entity';
import { LogPiece } from '../model/logpiece.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Render]),
    TypeOrmModule.forFeature([LogPiece]),
  ],
  providers: [RendersService],
  controllers: [PublicController],
})
export class PublicModule {}
