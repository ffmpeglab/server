import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../model/apikey.entity';
import { ApiKeyController } from './apikey.controller';
import { ApiKeyService } from './apikey.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  providers: [ApiKeyService],
  controllers: [ApiKeyController],
})
export class ApiKeyModule {}
