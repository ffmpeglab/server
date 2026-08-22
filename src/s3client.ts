import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';

export async function createS3Client() {
  const s3Client = new S3Client({
    ...config.s3,
    forcePathStyle: true,
  });
  return s3Client;
}
