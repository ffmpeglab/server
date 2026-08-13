export function extractTokenFromHeader(request: Request): string | undefined {
  const auth =
    (request.headers as any).authorization ||
    request.headers.get('authorization');
  const token = auth.replace('Bearer ', '');
  return token;
}
