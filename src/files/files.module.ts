import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AuthService } from '../auth/auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../model/apikey.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  providers: [FilesService, AuthService],
  controllers: [FilesController],
})
export class FilesModule {}
