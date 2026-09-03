import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { extractTokenFromHeader } from './util';
import crypto from 'node:crypto'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest<Request>();
      const token = extractTokenFromHeader(request);
      if (!token) {
        throw new UnauthorizedException();
      }
      let payload = await this.authService.findKey(token);
      if (!payload?.user_id) {
        payload = await this.authService.findKey(crypto.hash('sha512', token))
      }
      if (!payload?.user_id) {
        throw new UnauthorizedException()
      }
      request['user'] = payload?.user_id;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
