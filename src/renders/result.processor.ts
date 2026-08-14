import { Processor, Process } from 'nestjs-pgmq';
import { config } from '../config';
import type { PgmqJob } from 'nestjs-pgmq';
import { Media, MinimalMedia } from '../types';
import { RendersService } from './renders.service';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'node:fs';
import { getFileId } from '../ffmpeg/util/util';
import { getMimeType } from '../files/mime-utils';
import https from 'node:https';
import http from 'node:http';
@Processor(config.queue.file)
export class ResultProcessor {
  s3client: S3Client;
  constructor(private readonly renderService: RendersService) {
    this.s3client = new S3Client({
      ...config.s3,
      tls: config.s3.endpoint.search('https://') > -1 ? true : false,
      requestHandler: config.s3.endpoint.search('https://') > -1 ? https : http,
      forcePathStyle: true,
    });
  }
  @Process('file')
  async handleFile(
    job: PgmqJob<{
      renderId: string;
      media: MinimalMedia;
      userId: string;
      bucket?: string;
      outputPath?: string;
      runId?: string;
    }>,
  ) {
    console.log('new file', job);
    const { userId, media, renderId, bucket, outputPath, runId } =
      job.message.data;
    try {
      if (media?.id && this.s3client) {
        const fileStream = fs.createReadStream(media.filePath as string);
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(media)) {
          if (value !== undefined && value !== null) {
            metadata[key] = String(value);
          }
        }
        metadata.name = media.filename;
        if (runId) metadata.runId = runId; // <-- THIS IS THE FIX
        const fileKey =
          outputPath || `${userId}/${renderId}/${getFileId(media as Media)}`;
        // In FileProcessor, before PutObjectCommand
        const contentType = getMimeType(media.filename);
        const putObjectCmd = new PutObjectCommand({
          Bucket: bucket || config.s3.bucketId,
          Key: fileKey,
          Body: fileStream,
          ContentType: contentType,
          Metadata: metadata,
        });
        await this.s3client.send(putObjectCmd);

        // Generate presigned URL for GET
        const getObjectCmd = new GetObjectCommand({
          Bucket: config.s3.bucketId,
          Key: fileKey,
        });

        const link = await getSignedUrl(this.s3client, getObjectCmd, {
          expiresIn: 3600 * 24 * 6,
        }); // 6 days

        media.url = link;
        await this.renderService.updateMediaResult(renderId, {
          ...media,
          userId,
        });
      }
    } catch (err) {
      console.error('file upload err', err);
    }
  }
}
