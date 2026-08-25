// src/auth/auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { ApiKey } from '../model/apikey.entity';

const mockRepo = { findOneBy: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(ApiKey), useValue: mockRepo },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('looks up the key by exact token match', async () => {
    const row = { id: 'k1', apikey: 'secret-token' };
    mockRepo.findOneBy.mockResolvedValue(row);

    expect(await service.findKey('secret-token')).toBe(row);
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ apikey: 'secret-token' });
  });

  it('returns null for an unknown token (no throw)', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    expect(await service.findKey('nope')).toBeNull();
  });

  it('does not trim or normalize the token (⚠️ documents exact-match contract)', async () => {
    mockRepo.findOneBy.mockClear().mockResolvedValue(null);

    await service.findKey('  secret-token  ');

    // a token with whitespace is looked up verbatim — the DB decides
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({
      apikey: '  secret-token  ',
    });
  });

  it('propagates repository errors', async () => {
    mockRepo.findOneBy.mockRejectedValue(new Error('connection refused'));

    await expect(service.findKey('t')).rejects.toThrow('connection refused');
  });
});
