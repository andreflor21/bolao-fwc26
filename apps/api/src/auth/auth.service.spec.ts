import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<Pick<PrismaService, 'user' | 'refreshToken' | 'passwordReset' | '$transaction'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let email: jest.Mocked<Pick<EmailService, 'sendWelcome' | 'sendPasswordReset' | 'sendPaymentConfirmed'>>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      passwordReset: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((arr: unknown[]) => Promise.all(arr)),
    } as never;
    jwt = { signAsync: jest.fn().mockResolvedValue('jwt.access.token') } as never;
    email = {
      sendWelcome: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
    } as never;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: EmailService, useValue: email },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              ({
                BCRYPT_COST: 4,
                JWT_ACCESS_TTL: '15m',
                JWT_REFRESH_TTL: '7d',
              })[k],
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('registers a new user, hashes the password and issues tokens', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'u1',
        email: data.email,
        name: data.name,
        role: 'player',
        createdAt: new Date(),
        passwordHash: data.passwordHash,
      }),
    );

    const out = await service.register({ email: 'a@b.com', password: 'secret123', name: 'Ana' });

    expect(out.user.email).toBe('a@b.com');
    expect(out.tokens.accessToken).toBe('jwt.access.token');
    expect(out.tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);

    const created = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
    expect(await bcrypt.compare('secret123', created.passwordHash)).toBe(true);
    expect(email.sendWelcome).toHaveBeenCalledWith('a@b.com', 'Ana');
  });

  it('rejects duplicate email on register', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'exists' });
    await expect(
      service.register({ email: 'a@b.com', password: 'secret123', name: 'Ana' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects bad credentials on login', async () => {
    const hash = await bcrypt.hash('correct', 4);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ana',
      role: 'player',
      passwordHash: hash,
      createdAt: new Date(),
    });
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues new tokens on refresh and revokes the old one', async () => {
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'a@b.com', role: 'player' },
    });

    const out = await service.refresh('some-token');
    expect(out.accessToken).toBe('jwt.access.token');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt1' }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });

  it('silently ignores forgot-password for unknown email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.requestPasswordReset('ghost@nowhere.io')).resolves.toBeUndefined();
    expect(email.sendPasswordReset).not.toHaveBeenCalled();
    expect(prisma.passwordReset.create).not.toHaveBeenCalled();
  });
});
