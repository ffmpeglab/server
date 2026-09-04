import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PgmqModule } from 'nestjs-pgmq';
import { config } from './config';
import { RendersModule } from './renders/renders.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { FilesModule } from './files/files.module';
import { ApiKeyModule } from './apikey/apikey.module';

const optionalModules: (typeof AppModule)[] = [FilesModule];
if (config.pipelinesEnabled) {
  optionalModules.push(PipelinesModule);
}
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...config.db,
    }),
    PgmqModule.forRootAsync({
      useFactory: () => ({
        connection: config.db,
      }),
    }),
    // 2. Register a queue
    PgmqModule.registerQueue({
      name: config.queue.name,
    }),
    PgmqModule.registerQueue({
      name: config.queue.logs,
    }),
    PgmqModule.registerQueue({
      name: config.queue.file,
    }),
    RendersModule,
    ApiKeyModule,
    ...optionalModules,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
