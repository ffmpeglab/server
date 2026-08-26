// src/files/files.controller.spec.ts
import { FilesController } from './files.controller';
import { config } from '../config';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('@supabase/server/adapters/nestjs', () => ({
  withSupabase: () => () => undefined, // no-op guard at decoration time
  SupabaseCtx: () => (target: any, key: string, index: number) => undefined,
}));

describe('FilesController', () => {
  const filesService = {
    uploadFile: jest.fn(),
    listFiles: jest.fn(),
    getFile: jest.fn(),
  };
  const ctrl = new FilesController(filesService as any);
  const req = { user: 'user-1' };

  beforeEach(() => jest.clearAllMocks());

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

  type Admin = {
    auth: { admin: { listUsers: jest.Mock; generateLink: jest.Mock } };
  };
  const makeCtx = (admin: Admin) => ({ supabaseAdmin: admin }) as any;

  const happyAdmin = (): Admin => ({
    auth: {
      admin: {
        listUsers: jest.fn().mockResolvedValue({
          data: { users: [{ id: 'user-1', email: 'a@b.c' }] },
        }),
        generateLink: jest.fn().mockResolvedValue({
          data: { properties: { hashed_token: 'hash-1' } },
          error: null,
        }),
      },
    },
  });

  /** Stand in for the real supabase-js verifyOtp, which lives on a client
   *  created inside the guard — here we inject its result via the ctx. */
  const withVerifyOtp = (ctx: any, result: object) => {
    // verifyOtp is called on ctx.supabaseAdmin.auth in production;
    // wire the same shape the controller destructures
    (ctx.supabaseAdmin.auth as any).verifyOtp = jest
      .fn()
      .mockResolvedValue(result);
    return ctx;
  };

  it('s3config returns bucket/region/endpoint + session-token credentials for a valid user', async () => {
    const admin = happyAdmin();
    const ctx = makeCtx(admin);
    withVerifyOtp(ctx, {
      data: { session: { access_token: 'tok-9' } },
      error: null,
    });

    const result = await ctrl.s3(req, ctx);

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
    // magiclink is generated for the email of the matching user id
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'a@b.c',
    });
    expect(admin.auth.admin.generateLink).toHaveBeenCalledTimes(1);
  });

  it('s3config throws Unauthorized when no user matches req.user', async () => {
    const admin = happyAdmin();
    admin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'someone-else', email: 'x@y.z' }] },
    });

    await expect(ctrl.s3(req, makeCtx(admin))).rejects.toThrow();
    await expect(ctrl.s3(req, makeCtx(admin))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('s3config throws Unauthorized when matching user has no email', async () => {
    const admin = happyAdmin();
    admin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: undefined }] },
    });

    await expect(ctrl.s3(req, makeCtx(admin))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('s3config throws Unauthorized when generateLink errors', async () => {
    const admin = happyAdmin();
    admin.auth.admin.generateLink.mockResolvedValue({
      data: null,
      error: { message: 'user not found' },
    });
    const ctx = makeCtx(admin);
    withVerifyOtp(ctx, {});

    await expect(ctrl.s3(req, ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('s3config throws Unauthorized when verifyOtp errors', async () => {
    const ctx = makeCtx(happyAdmin());
    withVerifyOtp(ctx, { data: null, error: { message: 'expired' } });

    await expect(ctrl.s3(req, ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('s3config throws Unauthorized when verifyOtp yields no session token', async () => {
    const ctx = makeCtx(happyAdmin());
    withVerifyOtp(ctx, { data: { session: null }, error: null });

    await expect(ctrl.s3(req, ctx)).rejects.toThrow(UnauthorizedException);
  });
});
