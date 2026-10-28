import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service.js';

const scrypt = promisify(scryptCallback);
type TokenPayload = { sub: string; role: 'ADMIN' | 'CUSTOMER'; exp: number; typ: 'access' };

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get secret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to at least 32 characters.');
    }
    return secret;
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, stored: string) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private signAccessToken(user: { id: string; role: 'ADMIN' | 'CUSTOMER' }) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload: TokenPayload = {
      sub: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
      typ: 'access',
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  verifyAccessToken(token: string): TokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid access token.');
    const [header, body, signature] = parts;
    const expected = createHmac('sha256', this.secret).update(`${header}.${body}`).digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, 'base64url');
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedException('Invalid access token.');
    }
    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }
    if (payload.typ !== 'access' || payload.exp <= Date.now() / 1000) {
      throw new UnauthorizedException('Access token has expired.');
    }
    return payload;
  }

  private async issueTokens(user: { id: string; role: 'ADMIN' | 'CUSTOMER' }) {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken: this.signAccessToken(user), refreshToken };
  }

  async register(input: { email: string; password: string; name: string }) {
    void this.secret;
    const email = input.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || input.password.length < 10 || input.name.trim().length < 2) {
      throw new BadRequestException('Provide a valid email, a name, and a password with at least 10 characters.');
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists.');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: await this.hashPassword(input.password),
        cart: { create: {} },
        wishlist: { create: {} },
      },
      select: { id: true, email: true, name: true, role: true },
    });
    return { user, ...(await this.issueTokens(user)) };
  }

  async login(input: { email: string; password: string }) {
    void this.secret;
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user || !user.active || !(await this.verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    const profile = { id: user.id, email: user.email, name: user.name, role: user.role };
    return { user: profile, ...(await this.issueTokens(user)) };
  }

  async refresh(refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!stored || stored.expiresAt <= new Date() || !stored.user.active) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(stored.user);
  }

  async logout(refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    return { success: true };
  }

  async updateProfile(userId: string, input: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new UnauthorizedException('Account not found.');
    const email = input.email?.trim().toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Provide a valid email address.');
    if (input.name !== undefined && input.name.trim().length < 2) throw new BadRequestException('Name must contain at least two characters.');
    if (input.newPassword && input.newPassword.length < 10) throw new BadRequestException('New password must contain at least 10 characters.');
    if ((email && email !== current.email) || input.newPassword) {
      if (!input.currentPassword || !(await this.verifyPassword(input.currentPassword, current.passwordHash))) throw new UnauthorizedException('Current password is incorrect.');
    }
    if (email && email !== current.email && await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists.');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(email ? { email } : {}),
        ...(input.newPassword ? { passwordHash: await this.hashPassword(input.newPassword) } : {}),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (input.newPassword) await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return updated;
  }
}
