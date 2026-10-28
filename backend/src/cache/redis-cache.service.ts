import { Injectable, Logger } from '@nestjs/common';
import { connect } from 'node:net';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly fallback = new Map<string, { expiresAt: number; value: string }>();
  private get endpoint() {
    return new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  }

  private encode(parts: string[]) {
    return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
  }

  private async command(parts: string[]): Promise<string | null> {
    const endpoint = this.endpoint;
    const socket = connect({ host: endpoint.hostname, port: Number(endpoint.port || 6379) });
    return new Promise((resolve, reject) => {
      let buffer = '';
      let authPending = false;
      const timeout = setTimeout(() => socket.destroy(new Error('Redis request timed out.')), 800);
      const finish = (error?: Error, value?: string | null) => {
        clearTimeout(timeout);
        socket.destroy();
        error ? reject(error) : resolve(value ?? null);
      };
      socket.once('error', (error) => finish(error));
      socket.once('connect', () => {
        const password = decodeURIComponent(endpoint.password);
        if (password) {
          authPending = true;
          socket.write(this.encode(['AUTH', decodeURIComponent(endpoint.username || 'default'), password]));
        }
        else socket.write(this.encode(parts));
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.startsWith('-')) return finish(new Error(buffer.trim()));
        if (authPending && buffer.startsWith('+OK\r\n')) {
          authPending = false;
          buffer = buffer.slice(5);
          socket.write(this.encode(parts));
          return;
        }
        if (buffer.startsWith('+') && buffer.includes('\r\n')) {
          return finish(undefined, buffer.slice(1, buffer.indexOf('\r\n')));
        }
        if (buffer.startsWith('$')) {
          const end = buffer.indexOf('\r\n');
          if (end < 0) return;
          const length = Number(buffer.slice(1, end));
          if (length === -1) return finish(undefined, null);
          if (buffer.length >= end + 2 + length + 2) return finish(undefined, buffer.slice(end + 2, end + 2 + length));
        }
      });
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.command(['GET', key]);
      if (value) return JSON.parse(value) as T;
    } catch (error) {
      const cached = this.fallback.get(key);
      if (cached && cached.expiresAt > Date.now()) return JSON.parse(cached.value) as T;
      if (cached) this.fallback.delete(key);
      this.logger.debug(`Redis unavailable; using uncached database read: ${String(error)}`);
    }
    return undefined;
  }

  async set(key: string, value: unknown, ttlSeconds = 45) {
    const serialized = JSON.stringify(value);
    this.fallback.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
    try { await this.command(['SET', key, serialized, 'EX', String(ttlSeconds)]); }
    catch (error) { this.logger.debug(`Redis unavailable; cache retained in process memory: ${String(error)}`); }
  }
}
