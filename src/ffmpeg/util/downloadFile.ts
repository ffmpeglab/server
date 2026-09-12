import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { assertPublicUrl, pinnedLookup, BlockedUrlError } from './util';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

export const downloadFile = async ({
  filePath,
  dirPath,
  url,
}: {
  [key: string]: string;
}): Promise<string> => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // EEXIST — directory may already exist
  }

  return await downloadWithRedirects(filePath, url, 0);
};

const downloadWithRedirects = async (
  filePath: string,
  url: string,
  redirectDepth: number,
): Promise<string> => {
  if (redirectDepth > MAX_REDIRECTS) {
    throw new Error('too many redirects');
  }

  // Validate BEFORE opening the connection. `addresses` is the set we will
  // pin to, so a DNS server that changes its answer between this call and
  // the socket connect can't redirect us to a private IP.
  const { url: parsed, addresses } = await assertPublicUrl(url);

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: (...a: any[]) => void, arg?: any) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };

    let file: fs.WriteStream | undefined;

    const fail = (err: Error) => {
      try {
        file?.close();
      } catch {}
      fs.unlink(filePath, () => {});
      settle(reject, err);
    };

    const client = parsed.protocol === 'https:' ? https : http;

    const request = client.get(
      parsed,
      {
        lookup: pinnedLookup(addresses) as any,
        // Node does not follow redirects by default; we handle them manually
        // so each hop gets re-validated.
      },
      onResponse,
    );

    function onResponse(response: http.IncomingMessage) {
      // Redirect — re-validate the target, don't follow blindly.
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        const next = new URL(location, parsed).toString();
        return downloadWithRedirects(filePath, next, redirectDepth + 1).then(
          (p) => settle(resolve, p),
          (e) => fail(e as Error),
        );
      }

      response.on('error', (err: Error) =>
        fail(err instanceof Error ? err : new Error(String(err))),
      );

      if (status >= 400) {
        response.resume();
        return fail(new Error(`HTTP ${status}`));
      }

      file = fs.createWriteStream(filePath);
      response.pipe(file);
      file.on('finish', () => {
        file!.close(() => settle(resolve, filePath));
      });
      file.on('error', (err) => fail(err));
    }

    request.on('error', (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () =>
      request.destroy(new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms`)),
    );
  });
};

export { BlockedUrlError };
