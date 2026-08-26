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

  async uploadFile(userId: string, fileName: string, file: Buffer) {
    try {
      const s3Client = await createS3Client();
      const contentType = getMimeType(fileName);
      const fileKey = `${userId}/${fileName}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.s3.bucketId,
          Key: fileKey,
          Body: file,
          ACL: 'public-read',
          ContentType: contentType,
        }),
      );
      // Generate presigned URL for GET
      const getObjectCmd = new GetObjectCommand({
        Bucket: config.s3.bucketId,
        Key: fileKey,
      });

      const link = await getSignedUrl(s3Client, getObjectCmd, {
        expiresIn: 3600 * 24 * 6,
      }); // 6 days

      return { message: 'file_uploaded', link };
    } catch (error) {
      console.log(error);
      throw new Error('Error uploading file');
    }
  }

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
