import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { AuthService } from '../auth/auth.service';
import { ApiKey } from '../model/apikey.entity';
import { Item } from '../model/item.entity';
import { Role } from '../model/roles.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item]),
    TypeOrmModule.forFeature([Role]),
    TypeOrmModule.forFeature([ApiKey]),
  ],
  providers: [AuthService, ItemsService],
  controllers: [ItemsController],
})
export class ItemsModule {}
