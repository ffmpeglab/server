import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RendersService } from '../renders/renders.service';
import { PublicController } from './public.controller';
import { Render } from '../model/render.entity';
import { LogPiece } from '../model/logpiece.entity';
import { Item } from '../model/item.entity';
import { ItemsService } from '../items/items.service';
import { Role } from '../model/roles.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Render]),
    TypeOrmModule.forFeature([Role]),
    TypeOrmModule.forFeature([Item]),
    TypeOrmModule.forFeature([LogPiece]),
  ],
  providers: [RendersService, ItemsService],
  controllers: [PublicController],
})
export class PublicModule {}
