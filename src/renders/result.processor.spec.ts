import { Test } from '@nestjs/testing';
import { ResultProcessor } from './result.processor';
import { RendersService } from './renders.service';
import * as s3client from '../s3client';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn().mockImplementation((input) => input),
  GetObjectCommand: jest.fn().mockImplementation((input) => input),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example/file'),
}));
jest.mock('../ffmpeg/util/util', () => ({
  getFileId: jest.fn().mockReturnValue('file-123'),
}));
jest.mock('../files/mime-utils', () => ({
  getMimeType: jest.fn().mockReturnValue('video/mp4'),
}));
jest.mock('node:fs', () => ({
  createReadStream: jest.fn().mockReturnValue('stream'),
}));

const makeJob = (data: any) => ({ message: { data } }) as any;

describe('ResultProcessor', () => {
  let processor: ResultProcessor;
  const renderService = { updateMediaResult: jest.fn() };
  const sendMock = jest.fn().mockResolvedValue({});
  const fakeClient = { send: sendMock };

  const baseMedia = {
    id: 'm1',
    filename: 'out.mp4',
    filePath: '/tmp/out.mp4',
    duration: 5,
    width: 1920,
    height: 1080,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(s3client, 'createS3Client').mockResolvedValue(fakeClient as any);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResultProcessor,
        { provide: RendersService, useValue: renderService },
      ],
    }).compile();
    processor = moduleRef.get(ResultProcessor);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uploads file, stores signed URL in render result', async () => {
    renderService.updateMediaResult.mockResolvedValue({});

    await processor.handleFile(
      makeJob({
        userId: 'u1',
        renderId: 'r1',
        media: baseMedia,
        bucket: 'bkt',
        outputPath: 'custom/key.mp4',
      }),
    );

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'bkt',
        Key: 'custom/key.mp4',
        ContentType: 'video/mp4',
        Metadata: expect.objectContaining({ name: 'out.mp4' }),
      }),
    );
    expect(renderService.updateMediaResult).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        url: 'https://signed-url.example/file',
        userId: 'u1',
      }),
    );
  });

  it('includes runId in metadata when provided', async () => {
    await processor.handleFile(
      makeJob({
        userId: 'u1',
        renderId: 'r1',
        media: baseMedia,
        runId: 'run-77',
      }),
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Metadata: expect.objectContaining({ runId: 'run-77' }),
      }),
    );
  });

  it('falls back to default key path when no outputPath', async () => {
    await processor.handleFile(
      makeJob({ userId: 'u1', renderId: 'r1', media: baseMedia }),
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'u1/r1/file-123' }),
    );
  });

  it('does nothing when media has no id', async () => {
    await processor.handleFile(
      makeJob({ userId: 'u1', renderId: 'r1', media: {} }),
    );
    expect(sendMock).not.toHaveBeenCalled();
    expect(renderService.updateMediaResult).not.toHaveBeenCalled();
  });

  it('does nothing when s3 client unavailable', async () => {
    (s3client.createS3Client as jest.Mock).mockResolvedValue(null);
    await processor.handleFile(
      makeJob({ userId: 'u1', renderId: 'r1', media: baseMedia }),
    );
    expect(renderService.updateMediaResult).not.toHaveBeenCalled();
  });

  it('swallows upload errors without throwing', async () => {
    sendMock.mockRejectedValueOnce(new Error('upload fail'));
    await expect(
      processor.handleFile(
        makeJob({ userId: 'u1', renderId: 'r1', media: baseMedia }),
      ),
    ).resolves.not.toThrow();
  });
});
