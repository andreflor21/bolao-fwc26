import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_TOKEN_BYTES = 48;
const PASSWORD_RESET_BYTES = 32;
const PASSWORD_RESET_TTL_MINUTES = 60;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function parseTtlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const n = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return 900;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptCost: number;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.bcryptCost = Number(config.get('BCRYPT_COST') ?? 12);
    this.accessTtlSeconds = parseTtlToSeconds(config.get('JWT_ACCESS_TTL') ?? '15m');
    this.refreshTtlSeconds = parseTtlToSeconds(config.get('JWT_REFRESH_TTL') ?? '7d');
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptCost);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name.trim(),
          role: 'player',
          whatsapp: dto.whatsapp?.trim() || null,
          whatsappGroupOptIn: dto.whatsappGroupOptIn ?? false,
        },
        select: { id: true, email: true, name: true, role: true, pixKey: true, createdAt: true },
      });
    } catch (err) {
      // Corrida: dois registros simultâneos passam pelo findUnique acima e
      // batem na constraint UNIQUE do banco. Mapeia para o 409 amigável.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    await this.email.sendWelcome(user.email, user.name).catch((err) => {
      this.logger.warn(`Failed to send welcome email: ${err.message}`);
    });

    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.issueTokens(user);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        pixKey: user.pixKey,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Rotation: revoke current and issue a new pair.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user);
  }

  async logout(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Sempre retorna 200 — não vazar existência de e-mail.
    if (!user) {
      this.logger.log(`Password reset requested for unknown email (silently ignored)`);
      return;
    }
    const rawToken = crypto.randomBytes(PASSWORD_RESET_BYTES).toString('base64url');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await this.email.sendPasswordReset(user.email, user.name, rawToken).catch((err) => {
      this.logger.warn(`Failed to send password reset email: ${err.message}`);
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = sha256(token);
    const record = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(newPassword, this.bcryptCost);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const passwordHash = await bcrypt.hash(newPassword, this.bcryptCost);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async updateProfile(userId: string, data: { pixKey?: string | null }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { pixKey: data.pixKey },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        pixKey: true,
        createdAt: true,
      },
    });
  }

  private async issueTokens(user: { id: string; email: string; role: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const rawRefresh = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const tokenHash = sha256(rawRefresh);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.accessTtlSeconds,
    };
  }
}
