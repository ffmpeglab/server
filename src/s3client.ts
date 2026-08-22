import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';
import { UnauthorizedException } from '@nestjs/common';

export async function createS3Client() {
  if (config.isSupabasePlatform) {
    const session = (await (
      await fetch(
        `${config.platformHost}/platform/session/supabase/${config.tenantUserId}`,
        {
          headers: {
            authorization: 'Bearer ' + config.tenantServiceKey,
          },
        },
      )
    ).json()) as { access_token: string };

    if (!session.access_token) {
      throw new UnauthorizedException();
    }

    const client = new S3Client({
      forcePathStyle: true,
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      credentials: {
        accessKeyId: config.s3.region,
        secretAccessKey: config.supabaseAnonKey,
        sessionToken: session.access_token,
      },
    });

    return client;
  }
  const s3Client = new S3Client({
    ...config.s3,
    forcePathStyle: true,
  });
  return s3Client;
}
