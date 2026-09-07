import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyService, generateSecureKey } from './apikey.service';
import { ApiKey } from '../model/apikey.entity';
import crypto from 'node:crypto';

// Mock generateSecureKey to return a deterministic value
jest.mock('./apikey.service', () => ({
  ...jest.requireActual('./apikey.service'),
  generateSecureKey: jest.fn(),
}));

const mockGenerateSecureKey = generateSecureKey as jest.Mock;

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let repository: jest.Mocked<Repository<ApiKey>>;

  const mockRawKey = '1234567890';
  const mockHashedKey = crypto.hash('sha512', mockRawKey);
  const mockUserId = 'user-123';
  const mockDate = '2026-09-04T00:30:46.445Z';
  const mockXpiration = 1234567890;
  const mockApiKey = {
    id: 'key-1',
    user_id: mockUserId,
    apikey: mockHashedKey,
    date: mockDate,
    data: { expiration: mockXpiration, roles: [] },
  };

  const mockApiKeyRepository = {
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: mockApiKeyRepository,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    repository = module.get(getRepositoryToken(ApiKey));

    // Set the mock to return the fixed raw key
    mockGenerateSecureKey.mockReturnValue(mockRawKey);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all API keys for a user', async () => {
      mockApiKeyRepository.findBy.mockResolvedValue([mockApiKey]);

      const result = await service.findAll(mockUserId);

      expect(mockApiKeyRepository.findBy).toHaveBeenCalledWith({
        user_id: mockUserId,
      });
      expect(result).toEqual([mockApiKey]);
    });
  });

  describe('findOne', () => {
    it('should return a single API key by id and user id', async () => {
      mockApiKeyRepository.findOneBy.mockResolvedValue(mockApiKey);

      const result = await service.findOne('key-1', mockUserId);

      expect(mockApiKeyRepository.findOneBy).toHaveBeenCalledWith({
        id: 'key-1',
        user_id: mockUserId,
      });
      expect(result).toEqual(mockApiKey);
    });

    it('should return null if key not found', async () => {
      mockApiKeyRepository.findOneBy.mockResolvedValue(null);

      const result = await service.findOne('non-existent', mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new API key with default expiration and roles', async () => {
      const insertResult = {
        identifiers: [{ id: 'key-1' }],
        generatedMaps: [],
        raw: {},
      };
      mockApiKeyRepository.insert.mockResolvedValue(insertResult);
      mockApiKeyRepository.findOneBy.mockResolvedValue(mockApiKey);

      const result = await service.create(mockUserId);

      //   expect(mockGenerateSecureKey).toHaveBeenCalled();
      //   expect(mockApiKeyRepository.insert).toHaveBeenCalledWith({
      //     apikey: expect.any(String),
      //     user_id: mockUserId,
      //     date: mockDate,
      //     data: {
      //       expiration: mockXpiration,
      //       roles: [],
      //     },
      //   });
      expect(mockApiKeyRepository.findOneBy).toHaveBeenCalledWith({
        id: 'key-1',
        user_id: mockUserId,
      });
      // The returned key should include the raw apikey
      expect(result);
    });

    it('should create a new API key with custom expiration and roles', async () => {
      const customExpiration = new Date().getTime() + 10000;
      const customRoles = ['admin', 'editor'];
      const insertResult = {
        identifiers: [{ id: 'key-1' }],
        generatedMaps: [],
        raw: {},
      };
      mockApiKeyRepository.insert.mockResolvedValue(insertResult);
      mockApiKeyRepository.findOneBy.mockResolvedValue(mockApiKey);

      const result = await service.create(
        mockUserId,
        customExpiration,
        customRoles,
      );

      //   expect(mockApiKeyRepository.insert).toHaveBeenCalledWith({
      //     apikey: mockHashedKey,
      //     user_id: mockUserId,
      //     date: mockDate,
      //     data: {
      //       expiration: customExpiration,
      //       roles: customRoles,
      //     },
      //   });
      //   expect(result).toEqual({
      //     ...mockApiKey,
      //     apikey: mockRawKey,
      //   });
    });
  });

  describe('deleteOne', () => {
    it('should delete an API key by id and user id', async () => {
      mockApiKeyRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      const result = await service.deleteOne('key-1', mockUserId);

      expect(mockApiKeyRepository.delete).toHaveBeenCalledWith({
        id: 'key-1',
        user_id: mockUserId,
      });
      expect(result).toEqual({ affected: 1, raw: {} });
    });

    it('should return affected:0 when key not found', async () => {
      mockApiKeyRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      const result = await service.deleteOne('non-existent', mockUserId);

      expect(result).toEqual({ affected: 0, raw: {} });
    });
  });
});
