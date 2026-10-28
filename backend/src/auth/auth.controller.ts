import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOptions() {
    return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/auth', maxAge: 30 * 24 * 60 * 60 * 1000 };
  }

  private readRefreshToken(request: Request) {
    const cookie = request.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith('refreshToken='));
    return cookie ? decodeURIComponent(cookie.slice('refreshToken='.length)) : '';
  }

  @Post('register')
  async register(@Body() body: { email?: string; password?: string; name?: string }, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register({ email: body.email ?? '', password: body.password ?? '', name: body.name ?? '' });
    response.cookie('refreshToken', result.refreshToken, this.cookieOptions());
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login({ email: body.email ?? '', password: body.password ?? '' });
    response.cookie('refreshToken', result.refreshToken, this.cookieOptions());
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(this.readRefreshToken(request));
    response.cookie('refreshToken', result.refreshToken, this.cookieOptions());
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logout(this.readRefreshToken(request));
    response.clearCookie('refreshToken', this.cookieOptions());
    return result;
  }
}
