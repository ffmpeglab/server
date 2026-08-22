import fs from 'fs';
import http from 'http';
import https from 'https';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EncoderProject } from '../../types';
import { documentDir, getFileId } from './util';
import { config } from '../../config';
import { createS3Client } from '../../s3client';

const downloadFile = async ({ filePath, dirPath, url }) =>
  await new Promise((res, reject) => {
    try {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
      } catch (err) {}
      const file = fs.createWriteStream(filePath);
      const protocoledClient = url.search('https') > -1 ? https : http;
      const request = protocoledClient.get(url, function (response) {
        console.info({ response: response.headers });
        response.pipe(file);

        // after download completed close filestream
        file.on('finish', () => {
          file.close();
          console.log('Download Completed');
          res(file);
        });
      });
    } catch (err) {
      console.error('downloadFile err', err);
      reject(err);
    }
  });
// Reuse exact S3 client configuration from FileProcessor

export const syncMedia = async (media: EncoderProject) => {
  const s3Client = await createS3Client();
  // media.bucket is now stored in the render.data
  if (media.bucket) {
    const bucket = media.bucket || config.s3.bucketId;
    // media.key is the object path (previously we used media.url)
    const key = media.key || media.url; // fallback for backward compatibility
    console.info(`media key:${media.key} bucket: ${media.bucket}`);
    // Generate a presigned GET URL valid for 24 hours
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: 86400 }, // 24 hours
    );

    // Replace the key with the presigned URL for FFmpeg to consume
    media.url = presignedUrl;
  }
  // Optional: download the file locally if needed
  const filename = getFileId(media);
  const dirPath = `${documentDir()}/${media.folderId}`;
  const filePath = `${dirPath}/${filename}`;
  if (fs.existsSync(filePath)) {
    console.info('file exists', filePath);
    return filePath;
  }
  // fs.unlinkSync(filePath);
  console.info('start download file', filePath, media.url);
  await downloadFile({ filePath, dirPath, url: media.url });

  return filePath; // or return the presigned URL directly
};
