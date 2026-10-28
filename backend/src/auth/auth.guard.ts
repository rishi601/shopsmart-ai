import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string; role: string };
    }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer access token required.');
    const payload = this.auth.verifyAccessToken(authorization.slice(7));
    request.user = { id: payload.sub, role: payload.role };
    return true;
  }
}
