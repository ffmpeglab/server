import { Module, UseGuards } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PgmqModule } from 'nestjs-pgmq';
import { config } from './config';
import { RendersModule } from './renders/renders.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { FilesModule } from './files/files.module';
import { ApiKeyModule } from './apikey/apikey.module';
import { PublicModule } from './public/public.module';
import { RolesModule } from './roles/roles.module';
import { ItemsModule } from './items/items.module';
import { TasksModule } from './tasks/tasks.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { McpModule } from '@nestjs/mcp';

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
    McpModule.forRoot({
      name: 'ffmpeglab-renders',
      version: '1.0.0',
      instructions:
        'Use these tools to list, create, run, and inspect renders. All calls are scoped to the authenticated user.',
      path: 'mcp', // default; global prefix still applies
      include: [RendersModule], // scan only renders providers
      imports: [AuthModule], // so AuthGuard / AuthService resolve
      decorators: [UseGuards(AuthGuard)], // protect the MCP endpoint
    }),
    // 2. Register a queue
    PgmqModule.registerQueue({
      name: config.queue.name,
    }),
    PgmqModule.registerQueue({
      name: config.queue.logs,
    }),
    PgmqModule.registerQueue({
      name: config.queue.task,
    }),
    RendersModule,
    ApiKeyModule,
    PublicModule,
    ItemsModule,
    RolesModule,
    TasksModule,
    ...optionalModules,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
