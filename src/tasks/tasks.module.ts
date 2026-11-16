import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AuthService } from '../auth/auth.service';
import { ApiKey } from '../model/apikey.entity';
import { Item } from '../model/item.entity';
import { Role } from '../model/roles.entity';
import { config } from '../config';
import { TaskProcessor } from './tasks.processor';
import { ItemsService } from '../items/items.service';
import { RendersService } from '../renders/renders.service';
import { Render } from '../model/render.entity';
import { LogPiece } from '../model/logpiece.entity';

const optionalProviders = [
  ...(config.queue.isTaskRunner ? [TaskProcessor] : []),
];

@Module({
  imports: [
    TypeOrmModule.forFeature([Item]),
    TypeOrmModule.forFeature([Role]),
    TypeOrmModule.forFeature([ApiKey]),
    TypeOrmModule.forFeature([Render]),
    TypeOrmModule.forFeature([LogPiece]),
  ],
  providers: [
    AuthService,
    ItemsService,
    TasksService,
    RendersService,
    ...optionalProviders,
  ],
  controllers: [TasksController],
})
export class TasksModule {}
