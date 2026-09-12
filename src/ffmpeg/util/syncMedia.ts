import fs from 'node:fs';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EncoderProject } from '../../types';
import { documentDir, getFileId } from './util';
import { config } from '../../config';
import { createS3Client } from '../../s3client';
import { downloadFile } from './downloadFile';

export const syncMedia = async (media: EncoderProject) => {
  const filename = getFileId(media);
  const dirPath = `${documentDir()}/${media.folderId}`;
  const filePath = `${dirPath}/${filename}`;

  if (fs.existsSync(filePath)) {
    return filePath;
  }

  if (media.bucket) {
    const s3Client = await createS3Client();
    const bucket = media.bucket || config.s3.bucketId;
    const key = media.key || media.url;
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 86400 },
    );
    media.url = presignedUrl;
  }

  await downloadFile({ filePath, dirPath, url: media.url as string });
  return filePath;
};
