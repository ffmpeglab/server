import { Module } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PgmqModule } from 'nestjs-pgmq';
import { Render } from '../model/render.entity';
import { ApiKey } from '../model/apikey.entity';
import { LogPiece } from '../model/logpiece.entity';
import { AuthService } from '../auth/auth.service';
import { RendersService } from './renders.service';
import { RendersController } from './renders.controller';

export const mockRenderRepository = {
  find: jest.fn(),
  findBy: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
};

export const mockApiKeyRepository = {
  find: jest.fn(),
  findOneBy: jest.fn(),
};

export const mockLogPieceRepository = {
  find: jest.fn(),
  insert: jest.fn(),
};

export const mockQueue = {
  add: jest.fn().mockResolvedValue({ msgId: 1 }),
};

export const mockAuthService = {
  validateUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
  verifyToken: jest.fn().mockResolvedValue({ id: 'user-1' }),
  validateApiKey: jest.fn().mockResolvedValue({ id: 'apikey-1' }),
};

@Module({
  imports: [],
  controllers: [RendersController],
  providers: [
    { provide: getRepositoryToken(Render), useValue: mockRenderRepository },
    { provide: getRepositoryToken(ApiKey), useValue: mockApiKeyRepository },
    { provide: getRepositoryToken(LogPiece), useValue: mockLogPieceRepository },
    { provide: 'PGMQ_QUEUE_render', useValue: mockQueue },
    { provide: AuthService, useValue: mockAuthService },
    RendersService,
  ],
})
export class MockRendersModule {}
