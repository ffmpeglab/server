// src/files/files.service.spec.ts
import { Test } from '@nestjs/testing';
import { FilesService } from './files.service';
import { createS3Client } from '../s3client';
import {
  getSignedUrl,
  S3RequestPresigner,
} from '@aws-sdk/s3-request-presigner';
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsCommand,
} from '@aws-sdk/client-s3';
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

  // ------------------------------------------------ uploadFile

  describe('uploadFile', () => {
    const userId = 'user-1';
    const fileName = 'video.mp4';
    const buffer = Buffer.from('data');

    it('puts the object under userId/fileName with detected content type', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed/get');

      await service.uploadFile(userId, fileName, buffer);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].input).toEqual({
        Bucket: config.s3.bucketId,
        Key: 'user-1/video.mp4',
        Body: buffer,
        ACL: 'public-read',
        ContentType: 'video/mp4',
      });
    });

    it('returns message + 6-day presigned GET link for the uploaded key', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed/get');

      const result = await service.uploadFile(userId, fileName, buffer);

      expect(result).toEqual({
        message: 'file_uploaded',
        link: 'https://signed/get',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      // second arg is the GetObjectCommand for the same key
      expect(mockGetSignedUrl.mock.calls[0][1].input).toEqual({
        Bucket: config.s3.bucketId,
        Key: 'user-1/video.mp4',
      });
      expect(mockGetSignedUrl.mock.calls[0][2]).toEqual({
        expiresIn: 3600 * 24 * 6,
      });
    });

    it('maps extension case-insensitively', async () => {
      await service.uploadFile(userId, 'SONG.MP3', buffer);
      expect(mockSend.mock.calls[0][0].input.ContentType).toBe('audio/mpeg');
    });

    it('falls back to application/octet-stream for unknown extensions', async () => {
      await service.uploadFile(userId, 'thing.xyz123', buffer);
      expect(mockSend.mock.calls[0][0].input.ContentType).toBe(
        'application/octet-stream',
      );
    });

    it('propagates nothing sensitive — wraps S3 failure in generic Error', async () => {
      mockSend.mockRejectedValue(new Error('AccessDenied: secret stuff'));

      await expect(
        service.uploadFile(userId, fileName, buffer),
      ).rejects.toThrow('Error uploading file');
    });

    it('does not presign when the PUT fails', async () => {
      mockSend.mockRejectedValue(new Error('boom'));
      await service.uploadFile(userId, fileName, buffer).catch(() => {});
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
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

    it('⚠️ documents the fragile key derivation', async () => {
      // fileId.replace(userId, '') strips only the FIRST occurrence of userId
      // anywhere in the string. A fileId that merely CONTAINS the userId as a
      // substring gets mangled. e.g. user "bob", fileId "/bobby/x.mp4"
      // -> replace('bob','') removes leading 'bob' leaving 'by/x.mp4'.
      mockGetSignedUrl.mockResolvedValue('https://signed');
      await service.getFile('/bobby/x.mp4', 'bob');
      expect(mockGetSignedUrl.mock.calls[0][1].input.Key).toBe('bob/by/x.mp4'); // mangled!
    });
  });
});
