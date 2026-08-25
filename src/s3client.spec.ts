// src/s3client.spec.ts
import { createS3Client } from './s3client';
import { config } from './config';
import { S3Client } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((opts) => ({ __s3opts: opts })),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const MockS3Client = S3Client as unknown as jest.Mock;
const mockCreateClient = createClient as unknown as jest.Mock;

/** Build a fake supabase client whose auth.signInWithPassword resolves with `result` */
const mockSupabaseAuth = (result: object) => {
  const auth = { signInWithPassword: jest.fn().mockResolvedValue(result) };
  mockCreateClient.mockReturnValue({ auth });
  return auth;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createS3Client — Supabase platform branch', () => {
  beforeEach(() => {
    (config as any).isSupabasePlatform = true;
  });
  afterEach(() => {
    delete (config as any).isSupabasePlatform;
  });

  it('signs in with the worker credentials before constructing the client', async () => {
    const auth = mockSupabaseAuth({
      data: { session: { access_token: 'tok-123' } },
      error: null,
    });

    await createS3Client();

    expect(mockCreateClient).toHaveBeenCalledWith(
      config.supabaseHost,
      config.supabaseAnonKey,
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: config.supabaseWorkerLogin,
      password: config.tenantSecretKey,
    });
  });

  it('builds an S3 client with path-style, session token and project creds', async () => {
    mockSupabaseAuth({
      data: { session: { access_token: 'tok-123' } },
      error: null,
    });

    await createS3Client();

    expect(MockS3Client).toHaveBeenCalledTimes(1);
    expect(MockS3Client.mock.calls[0][0]).toEqual({
      forcePathStyle: true,
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      credentials: {
        accessKeyId: config.supabaseProjectId,
        secretAccessKey: config.supabaseAnonKey,
        sessionToken: 'tok-123',
      },
    });
  });

  it('⚠️ still constructs a client when sign-in FAILS (session undefined)', async () => {
    // Documents current behavior: `error` is destructured but never checked;
    // sessionToken just becomes undefined and the client is returned anyway.
    mockSupabaseAuth({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });

    const client = await createS3Client();

    expect(client).toBeDefined();
    expect(MockS3Client.mock.calls[0][0].credentials).toEqual({
      accessKeyId: config.supabaseProjectId,
      secretAccessKey: config.supabaseAnonKey,
      sessionToken: undefined,
    });
  });

  it('propagates if signInWithPassword itself rejects', async () => {
    const auth = {
      signInWithPassword: jest.fn().mockRejectedValue(new Error('network')),
    };
    mockCreateClient.mockReturnValue({ auth });

    await expect(createS3Client()).rejects.toThrow('network');
    expect(MockS3Client).not.toHaveBeenCalled();
  });
});

describe('createS3Client — plain S3 branch', () => {
  beforeEach(() => {
    (config as any).isSupabasePlatform = false;
  });
  afterEach(() => {
    delete (config as any).isSupabasePlatform;
  });

  it('never touches supabase', async () => {
    await createS3Client();

    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('spreads s3 config plus forcePathStyle into the client', async () => {
    await createS3Client();

    expect(MockS3Client).toHaveBeenCalledTimes(1);
    expect(MockS3Client.mock.calls[0][0]).toEqual({
      ...config.s3,
      forcePathStyle: true,
    });
    // forcePathStyle survives even if config.s3 carries its own value
    expect(MockS3Client.mock.calls[0][0].forcePathStyle).toBe(true);
  });
});
