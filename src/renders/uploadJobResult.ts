import { config } from '../config';
import { Media, MinimalMedia } from '../types';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'node:fs';
import { getFileId } from '../ffmpeg/util/util';
import { getMimeType } from '../files/mime-utils';
import { createS3Client } from '../s3client';

export const uploadJobResult = async (job: {
  renderId: string;
  media: MinimalMedia;
  userId: string;
  bucket?: string;
  outputPath?: string;
  runId?: string;
}) => {
  const s3Client = await createS3Client();
  const { userId, media, renderId, bucket, outputPath, runId } = job;
  try {
    if (media?.id && s3Client) {
      const fileStream = fs.createReadStream(media.filePath as string);
      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(media)) {
        if (value !== undefined && value !== null) {
          metadata[key] = String(value);
        }
      }

      metadata.name = media.filename;

      if (runId) metadata.runId = runId;

      const fileKey =
        outputPath || `${userId}/${renderId}/${getFileId(media as Media)}`;

      const contentType = getMimeType(media.filename);

      const Bucket = bucket || config.s3.bucketId;

      const putObjectCmd = new PutObjectCommand({
        Bucket,
        Key: fileKey,
        Body: fileStream,
        ContentType: contentType,
        Metadata: metadata,
      });

      await s3Client.send(putObjectCmd);
      if (Bucket !== config.publicBucket) {
        const getObjectCmd = new GetObjectCommand({
          Bucket,
          Key: fileKey,
        });

        const link = await getSignedUrl(s3Client, getObjectCmd, {
          expiresIn: 3600 * 24 * 6,
        });

        media.url = link;
      }

      if (Bucket === config.publicBucket)
        media.url = `${config.supabaseHost}/storage/v1/object/public/${Bucket}/${fileKey}`;
      return media;
    }
  } catch (err) {
    console.error('file upload err', err);
    throw new Error('file_upload_error');
  }
};
