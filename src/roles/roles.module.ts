import { Module, Render } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { AuthService } from '../auth/auth.service';
import { ApiKey } from '../model/apikey.entity';
import { Role } from '../model/roles.entity';
import { Item } from '../model/item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role]),
    TypeOrmModule.forFeature([ApiKey]),
    TypeOrmModule.forFeature([Item]),
    TypeOrmModule.forFeature([Render]),
  ],
  providers: [AuthService, RolesService],
  controllers: [RolesController],
})
export class RolesModule {}
