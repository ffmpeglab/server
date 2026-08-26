export function extractTokenFromHeader(request: Request): string | undefined {
  const auth: string | null =
    (request?.headers['authorization'] as string) ||
    request?.headers?.get('authorization');
  const token = auth?.replace('Bearer ', '');
  return token;
}
