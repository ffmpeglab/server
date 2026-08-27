// src/files/files.controller.spec.ts
import { FilesController } from './files.controller';
import { config, supabaseEnv } from '../config';
import { UnauthorizedException } from '@nestjs/common';

// Mock the config module
jest.mock('../config', () => ({
  config: {
    s3: {
      bucketId: 'test-bucket',
      region: 'test-region',
    },
    supabaseHost: 'http://localhost:54321',
    supabaseProjectId: 'test-project-id',
    supabaseAnonKey: 'test-anon-key',
  },
  supabaseEnv: {
    url: 'http://localhost:54321',
    secretKeys: {
      default: 'test-service-role-key',
    },
  },
}));

// Mock @supabase/supabase-js
const mockCreateClient = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => mockCreateClient(...args),
}));

describe('FilesController', () => {
  const filesService = {
    uploadFile: jest.fn(),
    listFiles: jest.fn(),
    getFile: jest.fn(),
  };
  const ctrl = new FilesController(filesService as any);
  const req = { user: 'user-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upload passes user, originalname, buffer to the service', async () => {
    filesService.uploadFile.mockResolvedValue({ ok: true });
    const file = { originalname: 'a.mp4', buffer: Buffer.from('x') };

    expect(await ctrl.upload(file, req)).toEqual({ ok: true });
    expect(filesService.uploadFile).toHaveBeenCalledWith(
      'user-1',
      'a.mp4',
      file.buffer,
    );
  });

  it('list delegates to the service with req.user', async () => {
    filesService.listFiles.mockResolvedValue({ list: [] });
    await ctrl.list(req);
    expect(filesService.listFiles).toHaveBeenCalledWith('user-1');
  });

  it('file passes params.id and req.user', async () => {
    filesService.getFile.mockResolvedValue({ link: 'x' });
    await ctrl.file({ id: '/user-1/v.mp4' }, req);
    expect(filesService.getFile).toHaveBeenCalledWith(
      '/user-1/v.mp4',
      'user-1',
    );
  });

  // ------------------------------------------------ s3config

  const createMockSupabaseClient = (overrides: any = {}) => ({
    auth: {
      admin: {
        listUsers: jest.fn().mockResolvedValue({
          data: { users: [{ id: 'user-1', email: 'a@b.c' }] },
          error: null,
        }),
        generateLink: jest.fn().mockResolvedValue({
          data: { properties: { hashed_token: 'hash-1' } },
          error: null,
        }),
      },
      verifyOtp: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'tok-9' } },
        error: null,
      }),
    },
    ...overrides,
  });

  it('s3config returns bucket/region/endpoint + session-token credentials for a valid user', async () => {
    const mockClient = createMockSupabaseClient();
    mockCreateClient.mockReturnValue(mockClient);

    const result = await ctrl.s3(req);

    expect(result).toEqual({
      bucketId: config.s3.bucketId,
      region: config.s3.region,
      endpoint: config.supabaseHost + '/storage/v1/s3',
      credentials: {
        accessKeyId: config.supabaseProjectId,
        secretAccessKey: config.supabaseAnonKey,
        sessionToken: 'tok-9',
      },
      userId: 'user-1',
    });
    expect(mockClient.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'a@b.c',
    });
    expect(mockClient.auth.admin.generateLink).toHaveBeenCalledTimes(1);
  });

  it('s3config throws Unauthorized when no user matches req.user', async () => {
    const mockClient = createMockSupabaseClient();
    mockClient.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'someone-else', email: 'x@y.z' }] },
    });
    mockCreateClient.mockReturnValue(mockClient);

    await expect(ctrl.s3(req)).rejects.toThrow(UnauthorizedException);
    expect(mockClient.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('s3config throws Unauthorized when matching user has no email', async () => {
    const mockClient = createMockSupabaseClient();
    mockClient.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: undefined }] },
    });
    mockCreateClient.mockReturnValue(mockClient);

    await expect(ctrl.s3(req)).rejects.toThrow(UnauthorizedException);
  });

  it('s3config throws Unauthorized when generateLink errors', async () => {
    const mockClient = createMockSupabaseClient();
    mockClient.auth.admin.generateLink.mockResolvedValue({
      data: null,
      error: { message: 'user not found' },
    });
    mockCreateClient.mockReturnValue(mockClient);

    await expect(ctrl.s3(req)).rejects.toThrow(UnauthorizedException);
  });

  it('s3config throws Unauthorized when verifyOtp errors', async () => {
    const mockClient = createMockSupabaseClient();
    mockClient.auth.verifyOtp.mockResolvedValue({
      data: null,
      error: { message: 'expired' },
    });
    mockCreateClient.mockReturnValue(mockClient);

    await expect(ctrl.s3(req)).rejects.toThrow(UnauthorizedException);
  });

  it('s3config throws Unauthorized when verifyOtp yields no session token', async () => {
    const mockClient = createMockSupabaseClient();
    mockClient.auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockCreateClient.mockReturnValue(mockClient);

    await expect(ctrl.s3(req)).rejects.toThrow(UnauthorizedException);
  });
});