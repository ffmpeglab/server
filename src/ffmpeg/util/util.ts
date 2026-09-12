import { config } from '../../config';
import { Media } from '../../types';

export const processFileName = (filename: string) =>
  filename?.replace(/[^a-zA-Z0-9_.-]/g, '') || '';

export const getFileId = (media: Media) =>
  `${processFileName(media.id)}_${processFileName(media.filename || media.title)}`;

export const documentDir = () => config.documentDir;

// Validates that a URL resolves only to public IP addresses, and provides a
// `lookup` implementation that pins the connection to the validated address
// so DNS rebinding can't swap it out between check and connect.

import dns from 'node:dns/promises';
import net from 'node:net';

// ---------------------------------------------------------------------------
// byte helpers
// ---------------------------------------------------------------------------

const ipv4ToBytes = (ip: string): Uint8Array =>
  Uint8Array.from(ip.split('.').map(Number));

const ipv6ToBytes = (ip: string): Uint8Array => {
  const clean = ip.replace(/^\[|\]$/g, '');
  const dcIdx = clean.indexOf('::');
  let head: string[];
  let tail: string[];

  if (dcIdx >= 0) {
    head = clean.slice(0, dcIdx).split(':').filter(Boolean);
    tail = clean
      .slice(dcIdx + 2)
      .split(':')
      .filter(Boolean);
  } else {
    head = clean.split(':');
    tail = [];
  }

  // embedded IPv4 in the last group (::ffff:127.0.0.1)
  const lastTok = tail.length
    ? tail[tail.length - 1]
    : (head[head.length - 1] ?? '');
  let v4: Uint8Array | null = null;
  if (lastTok.includes('.')) {
    v4 = ipv4ToBytes(lastTok);
    if (tail.length) tail.pop();
    else head.pop();
  }

  const missing = 8 - head.length - tail.length - (v4 ? 2 : 0);
  const bytes = new Uint8Array(16);
  let pos = 0;
  for (const g of head) {
    const n = parseInt(g || '0', 16);
    bytes[pos++] = (n >> 8) & 0xff;
    bytes[pos++] = n & 0xff;
  }
  pos += missing * 2;
  for (const g of tail) {
    const n = parseInt(g || '0', 16);
    bytes[pos++] = (n >> 8) & 0xff;
    bytes[pos++] = n & 0xff;
  }
  if (v4) bytes.set(v4, pos);
  return bytes;
};

// ---------------------------------------------------------------------------
// CIDR helpers
// ---------------------------------------------------------------------------

type Cidr = { base: Uint8Array; prefix: number };

const cidr4 = (s: string): Cidr => {
  const [ip, p] = s.split('/');
  return { base: ipv4ToBytes(ip), prefix: Number(p) };
};
const cidr6 = (s: string): Cidr => {
  const [ip, p] = s.split('/');
  return { base: ipv6ToBytes(ip), prefix: Number(p) };
};

const inCidr = (addr: Uint8Array, { base, prefix }: Cidr): boolean => {
  const fullBytes = prefix >>> 3;
  const remBits = prefix & 7;
  for (let i = 0; i < fullBytes; i++) {
    if (addr[i] !== base[i]) return false;
  }
  if (remBits) {
    const mask = (0xff << (8 - remBits)) & 0xff;
    if ((addr[fullBytes] & mask) !== (base[fullBytes] & mask)) return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// blocklists (IANA special-purpose ranges + cloud metadata)
// ---------------------------------------------------------------------------

const V4_BLOCKS: Cidr[] = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8', // RFC1918
  '100.64.0.0/10', // CGNAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local (incl. 169.254.169.254)
  '172.16.0.0/12', // RFC1918
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // TEST-NET-1
  '192.88.99.0/24', // 6to4 relay anycast (deprecated)
  '192.168.0.0/16', // RFC1918
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved
  '255.255.255.255/32', // broadcast
].map(cidr4);

const V6_BLOCKS: Cidr[] = [
  '::/128', // unspecified
  '::1/128', // loopback
  '::ffff:0:0/96', // IPv4-mapped (unwrapped and re-checked below)
  '64:ff9b::/96', // NAT64 well-known
  '64:ff9b:1::/48', // NAT64 local-use
  '100::/64', // discard-only
  '2001::/32', // Teredo
  '2001:db8::/32', // documentation
  '2002::/16', // 6to4
  'fc00::/7', // unique local
  'fe80::/10', // link-local
  'ff00::/8', // multicast
].map(cidr6);

const isV4Mapped = (b: Uint8Array): boolean => {
  for (let i = 0; i < 10; i++) if (b[i] !== 0) return false;
  return b[10] === 0xff && b[11] === 0xff;
};

export const isBlockedAddress = (ip: string): boolean => {
  const family = net.isIP(ip);
  if (family === 4) {
    const bytes = ipv4ToBytes(ip);
    return V4_BLOCKS.some((c) => inCidr(bytes, c));
  }
  if (family === 6) {
    const bytes = ipv6ToBytes(ip);
    if (isV4Mapped(bytes)) {
      return isBlockedAddress(
        `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`,
      );
    }
    return V6_BLOCKS.some((c) => inCidr(bytes, c));
  }
  return true; // not an IP
};

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export class BlockedUrlError extends Error {
  constructor(
    message: string,
    public readonly code:
      'protocol' | 'credentials' | 'dns' | 'ip' | 'malformed',
  ) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export interface ResolvedPublicUrl {
  url: URL;
  addresses: { address: string; family: 4 | 6 }[];
}

export async function assertPublicUrl(
  input: string | URL,
): Promise<ResolvedPublicUrl> {
  let url: URL;
  try {
    url =
      typeof input === 'string' ? new URL(input) : new URL(input.toString());
  } catch {
    throw new BlockedUrlError('malformed URL', 'malformed');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BlockedUrlError(
      `protocol ${url.protocol} not allowed`,
      'protocol',
    );
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('credentials in URL not allowed', 'credentials');
  }

  const host = url.hostname;

  // IP literal — the URL parser normalises decimal/octal/hex IPv4 and
  // IPv4-mapped IPv6 into canonical notation before we see it.
  const literalFamily = net.isIP(host);
  if (literalFamily) {
    if (isBlockedAddress(host)) {
      throw new BlockedUrlError(`blocked IP literal ${host}`, 'ip');
    }
    return {
      url,
      addresses: [{ address: host, family: literalFamily as 4 | 6 }],
    };
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) {
    throw new BlockedUrlError(`no DNS records for ${host}`, 'dns');
  }

  // Any blocked address in the set rejects the whole URL — an attacker can't
  // hide a loopback AAAA alongside a public A and rely on ordering.
  const blocked = records.find((r) => isBlockedAddress(r.address));
  if (blocked) {
    throw new BlockedUrlError(
      `${host} resolves to blocked address ${blocked.address}`,
      'ip',
    );
  }

  return {
    url,
    addresses: records.map((r) => ({
      address: r.address,
      family: r.family as 4 | 6,
    })),
  };
}

/**
 * A `lookup` implementation for http/https request options that returns the
 * already-validated address. Prevents DNS rebinding: the address that was
 * checked is the address the socket connects to.
 */
export function pinnedLookup(addresses: ResolvedPublicUrl['addresses']) {
  return (
    _hostname: string,
    options: unknown,
    callback: (...args: any[]) => void,
  ) => {
    if (typeof options === 'function') {
      callback = options as (...args: any[]) => void;
    }
    const opts = typeof options === 'object' && options ? (options as any) : {};
    if (opts.all) {
      callback(null, addresses);
    } else {
      const first = addresses[0];
      callback(null, first.address, first.family);
    }
  };
}
