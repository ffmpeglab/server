// Mock the Swagger decorators before importing the controller
jest.mock('@nestjs/swagger', () => ({
  ApiBearerAuth: jest.fn(() => () => {}),
  ApiParam: jest.fn(() => () => {}),
  ApiResponse: jest.fn(() => () => {}),
}));

// Mock the Supabase guard
jest.mock('@supabase/server/adapters/nestjs', () => ({
  withSupabase: jest.fn().mockImplementation(() => () => true),
  SupabaseCtx: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyController } from './apikey.controller';
import { ApiKeyService } from './apikey.service';
import { SupabaseContext } from '@supabase/server';
import { ApiKey } from '../model/apikey.entity';

describe('ApiKeyController', () => {
  let controller: ApiKeyController;
  let service: jest.Mocked<ApiKeyService>;

  const mockUser = { id: 'user-123' } as SupabaseContext['userClaims'];
  const mockApiKey = {
    id: 'key-1',
    userId: 'user-123',
    apikey: 'sk_test_123',
    created: new Date(),
    lastUsed: null,
  } as ApiKey;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [
        {
          provide: ApiKeyService,
          useValue: {
            findAll: jest.fn(),
            deleteOne: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ApiKeyController>(ApiKeyController);
    service = module.get(ApiKeyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all API keys for the user without the apikey field', async () => {
      const keys = [
        { ...mockApiKey, id: 'key-1' },
        { ...mockApiKey, id: 'key-2' },
      ];
      service.findAll.mockResolvedValue(keys);

      const result = await controller.findAll(mockUser);

      expect(service.findAll).toHaveBeenCalledWith('user-123');
      expect(result).toEqual([
        { ...keys[0], apikey: undefined },
        { ...keys[1], apikey: undefined },
      ]);
    });

    it('should return an empty array when no keys exist', async () => {
      service.findAll.mockResolvedValue([]);

      const result = await controller.findAll(mockUser);

      expect(service.findAll).toHaveBeenCalledWith('user-123');
      expect(result).toEqual([]);
    });
  });

  describe('deleteOne', () => {
    it('should delete an API key by id and user id', async () => {
      const params = { id: 'key-1' };
      service.deleteOne.mockResolvedValue({ affected: 1 });

      const result = await controller.deleteOne(params, mockUser);

      expect(service.deleteOne).toHaveBeenCalledWith('key-1', 'user-123');
      expect(result).toEqual({ affected: 1 });
    });

    it('should handle deletion of a non-existent key gracefully', async () => {
      const params = { id: 'non-existent' };
      service.deleteOne.mockResolvedValue({ affected: 0 });

      const result = await controller.deleteOne(params, mockUser);

      expect(service.deleteOne).toHaveBeenCalledWith(
        'non-existent',
        'user-123',
      );
      expect(result).toEqual({ affected: 0 });
    });

    it('should propagate errors from the service', async () => {
      const params = { id: 'key-1' };
      const error = new Error('Database connection lost');
      service.deleteOne.mockRejectedValue(error);

      await expect(controller.deleteOne(params, mockUser)).rejects.toThrow(
        error,
      );
    });
  });

  describe('create', () => {
    it('should create a new API key for the user', async () => {
      const newKey = { ...mockApiKey, apikey: 'sk_test_new' };
      service.create.mockResolvedValue(newKey);

      const result = await controller.create(mockUser);

      expect(service.create).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(newKey);
    });

    it('should propagate errors from the service', async () => {
      const error = new Error('Key generation failed');
      service.create.mockRejectedValue(error);

      await expect(controller.create(mockUser)).rejects.toThrow(error);
    });
  });
});
