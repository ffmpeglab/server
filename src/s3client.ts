import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';
import { createClient } from '@supabase/supabase-js';

export async function createS3Client() {
  if (config.isSupabasePlatform) {
    const supabaseClient = createClient(
      config.supabaseHost,
      config.supabaseAnonKey,
    );

    const {
      data: { session },
      error,
    } = await supabaseClient.auth.signInWithPassword({
      email: config.supabaseWorkerLogin,
      password: config.tenantSecretKey,
    });
    // console.info({session, error})
    const client = new S3Client({
      forcePathStyle: true,
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      credentials: {
        accessKeyId: config.supabaseProjectId,
        secretAccessKey: config.supabaseAnonKey,
        sessionToken: session?.access_token,
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
