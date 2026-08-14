import { Injectable } from '@nestjs/common';
import { Server } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { config } from '../config';
import type { Request, Response } from 'express';
import { extractTokenFromHeader } from '../auth/util';
import { AuthService } from '../auth/auth.service';

const s3Store = new S3Store({
  partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MiB,
  s3ClientConfig: {
    bucket: config.s3.bucketId,
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    credentials: config.s3.credentials,
    forcePathStyle: true,
  },
});

@Injectable()
export class TusService {
  server: Server;
  constructor(private readonly authService: AuthService) {
    this.server = new Server({
      path: '/files/tus/',
      datastore: s3Store,
      maxSize: config.maxUploadSize as number,
      generateUrl(req, { proto, host, path, id }) {
        id = Buffer.from(id, 'utf-8').toString('base64url');
        return `${proto}://${host}${path}/${id}`;
      },
      getFileIdFromRequest(req, lastPath) {
        return Buffer.from(lastPath as string, 'base64url').toString('utf-8');
      },
      namingFunction: async (req, metadata) => {
        try {
          const token = extractTokenFromHeader(req);
          const apikey = await authService.findKey(token!);
          const naming = `${apikey!.user_id}/${metadata!.objectName?.replace(apikey!.user_id, '')}`;
          return naming;
        } catch (err) {
          console.error('tus naming err', err);
          throw 'unauthorized';
        }
      },
      respectForwardedHeaders: true,
    });
  }
  handleRequest(req: Request, res: Response) {
    return this.server.handle(req, res);
  }
}
