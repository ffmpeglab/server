import fs from 'fs';
import http from 'http';
import https from 'https';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EncoderProject } from '../../types';
import { documentDir, getFileId } from './util';
import { config } from '../../config';
import { createS3Client } from '../../s3client';

const REQUEST_TIMEOUT_MS = 30_000;

export const downloadFile = ({ filePath, dirPath, url }) =>
  new Promise((resolve, reject) => {
    try {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
      } catch (err) {
        // EEXIST etc. — directory may already exist
      }

      // URL-parsing protocol detection (substring .search('https') misfires
      // on URLs like http://proxy/?redirect=https://other)
      const client = url.startsWith('https') ? https : http;
      let file: fs.WriteStream | undefined; // declared where fail can see it

      let settled = false;
      const settle = (fn: (...a: any[]) => void, arg?: any) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };

      const fail = (err: Error) => {
        // never leave a partial file behind on any failure path
        try {
          file?.close();
        } catch {}
        fs.unlink(filePath, () => {});
        settle(reject, err);
      };

      const request = client.get(url, onResponse);
      request.on('error', (err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      function onResponse(response: http.IncomingMessage) {
        response.on('error', (err: Error) =>
          fail(err instanceof Error ? err : new Error(String(err))),
        );

        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          return fail(new Error(`HTTP ${response.statusCode}`));
        }
        file = fs.createWriteStream(filePath);
        response.pipe(file);
        file.on('finish', () => {
          file!.close(() => resolve(filePath));
        });
      }
      request.setTimeout(REQUEST_TIMEOUT_MS, () =>
        request.destroy(new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms`)),
      );
    } catch (err) {
      console.error('downloadFile err', err);
      reject(err);
    }
  });

export const syncMedia = async (media: EncoderProject) => {
  const filename = getFileId(media);
  const dirPath = `${documentDir()}/${media.folderId}`;
  const filePath = `${dirPath}/${filename}`;
  // CACHE FIRST — skip presigning entirely when we already have the file
  if (fs.existsSync(filePath)) {
    console.info('file exists', filePath);
    return filePath;
  }

  if (media.bucket) {
    const s3Client = await createS3Client();
    const bucket = media.bucket || config.s3.bucketId;
    const key = media.key || media.url; // legacy fallback: urls are always keys
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 86400 }, // 24 hours
    );
    media.url = presignedUrl; // bearer-token handoff to the downloader
  }

  console.info('start download file', filePath, media.url);
  await downloadFile({ filePath, dirPath, url: media.url });

  return filePath;
};
