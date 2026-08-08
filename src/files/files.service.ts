import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectAnnotationsCommand,
  ListObjectsCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config';
import { getMimeType } from './mime-utils';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class FilesService {
  s3client: S3Client;
  constructor() {
    this.s3client = new S3Client({
      ...config.s3,
      forcePathStyle: true,
    });
  }

  async uploadFile(userId: string, fileName: string, file: Buffer) {
    try {
      const contentType = getMimeType(fileName);
      const fileKey = `${userId}/${fileName}`;
      await this.s3client.send(
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

      const link = await getSignedUrl(this.s3client, getObjectCmd, {
        expiresIn: 3600 * 24 * 6,
      }); // 6 days

      return { message: 'file_uploaded', link };
    } catch (error) {
      console.log(error);
      throw new Error('Error uploading file');
    }
  }

  async listFiles(userId: string) {
    const listObjectsCommand = new ListObjectsCommand({
      Bucket: config.s3.bucketId,
      Prefix: userId,
    });

    const list = await this.s3client.send(listObjectsCommand);

    return { list: list.Contents };
  }

  async getFile(fileId: string, userId: string) {
    const fileKey = `${userId}${fileId.replace(userId, '')}`;
    const getObjectCmd = new GetObjectCommand({
      Bucket: config.s3.bucketId,
      Key: fileKey,
    });

    const link = await getSignedUrl(this.s3client, getObjectCmd, {
      expiresIn: 3600 * 24 * 6,
    });

    return { link };
  }
}
