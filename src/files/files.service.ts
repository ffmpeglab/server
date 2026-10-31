import { Injectable } from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config';
import { getMimeType } from './mime-utils';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client } from '../s3client';

@Injectable()
export class FilesService {
  constructor() {}

  async listFiles(userId: string) {
    const s3Client = await createS3Client();
    const listObjectsCommand = new ListObjectsCommand({
      Bucket: config.s3.bucketId,
      Prefix: userId,
    });

    const list = await s3Client.send(listObjectsCommand);

    return { list: list.Contents };
  }

  async getFile(fileId: string, userId: string) {
    const s3Client = await createS3Client();
    const fileKey = `${userId}${fileId.replace(`${userId}`, '')}`;
    const getObjectCmd = new GetObjectCommand({
      Bucket: config.s3.bucketId,
      Key: fileKey,
    });

    const link = await getSignedUrl(s3Client, getObjectCmd, {
      expiresIn: 3600 * 24 * 6,
    });

    return { link };
  }
}
