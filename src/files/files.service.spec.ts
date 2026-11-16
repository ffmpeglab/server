// src/files/files.service.spec.ts
import { Test } from '@nestjs/testing';
import { FilesService } from './files.service';
import { createS3Client } from '../s3client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

jest.mock('../s3client', () => ({ createS3Client: jest.fn() }));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  ListObjectsCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

const mockCreateS3Client = createS3Client as unknown as jest.Mock;
const mockGetSignedUrl = getSignedUrl as unknown as jest.Mock;
const mockSend = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockReset();
  mockCreateS3Client.mockResolvedValue({ send: mockSend });
});

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FilesService],
    }).compile();
    service = moduleRef.get(FilesService);
  });

  // ------------------------------------------------ listFiles

  describe('listFiles', () => {
    it('lists with the userId as Prefix', async () => {
      const contents = [{ Key: 'user-1/a.mp4' }];
      mockSend.mockResolvedValue({ Contents: contents });

      const result = await service.listFiles('user-1');

      expect(mockSend.mock.calls[0][0].input).toEqual({
        Bucket: config.s3.bucketId,
        Prefix: 'user-1',
      });
      expect(result).toEqual({ list: contents });
    });

    it('passes through undefined Contents (empty bucket)', async () => {
      mockSend.mockResolvedValue({});
      expect(await service.listFiles('user-1')).toEqual({ list: undefined });
    });

    it('propagates S3 errors unwrapped', async () => {
      mockSend.mockRejectedValue(new Error('NoSuchBucket'));
      await expect(service.listFiles('user-1')).rejects.toThrow('NoSuchBucket');
    });
  });

  // ------------------------------------------------ getFile

  describe('getFile', () => {
    it('presigns a GET for the requested key', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed/file');

      const result = await service.getFile('user-1/video.mp4', 'user-1');

      expect(mockGetSignedUrl.mock.calls[0][1].input).toEqual({
        Bucket: config.s3.bucketId,
        Key: 'user-1/video.mp4',
      });
      expect(result).toEqual({ link: 'https://signed/file' });
      expect(mockGetSignedUrl.mock.calls[0][2]).toEqual({
        expiresIn: 3600 * 24 * 6,
      });
    });
  });
});
