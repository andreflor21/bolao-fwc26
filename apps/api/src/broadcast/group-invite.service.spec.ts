import { GroupInviteService } from './group-invite.service';
import { WhatsappService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';

function buildPrisma(opts: {
  subs: Array<{
    userId: string;
    user: { id: string; name: string; whatsapp: string | null; whatsappGroupOptIn: boolean };
  }>;
  recentLogs?: Array<{
    targetUserId: string;
    presetKey: string;
    status: string;
    createdAt: Date;
  }>;
}) {
  const createdLogs: Array<Record<string, unknown>> = [];
  return {
    _createdLogs: createdLogs,
    subscription: {
      findMany: jest.fn(async () => opts.subs),
    },
    broadcastLog: {
      findMany: jest.fn(async () => opts.recentLogs ?? []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdLogs.push(data);
        return { id: 'log-' + createdLogs.length, ...data };
      }),
    },
  } as never;
}

function mockConfig(env: Record<string, string | undefined>) {
  return {
    get: jest.fn(<T = unknown>(key: string): T | undefined => env[key] as T | undefined),
  } as unknown as ConfigService;
}

describe('GroupInviteService.listCandidates', () => {
  it('só lista quem tem opt-in + whatsapp + sub ativa', async () => {
    const prisma = buildPrisma({
      subs: [
        {
          userId: 'u1',
          user: { id: 'u1', name: 'Ana', whatsapp: '11999999999', whatsappGroupOptIn: true },
        },
        {
          userId: 'u2',
          user: { id: 'u2', name: 'Sem WhatsApp', whatsapp: null, whatsappGroupOptIn: true },
        },
        {
          userId: 'u3',
          user: { id: 'u3', name: 'Sem opt-in', whatsapp: '11888888888', whatsappGroupOptIn: false },
        },
      ],
    });
    const wa = new WhatsappService(mockConfig({ WHATSAPP_PROVIDER: 'mock' }));
    const svc = new GroupInviteService(prisma, wa);
    const list = await svc.listCandidates();
    expect(list.map((c) => c.userId)).toEqual(['u1']);
    expect(list[0]!.whatsappNormalized).toBe('5511999999999');
  });

  it('marca lastInviteStatus quando há log recente', async () => {
    const prisma = buildPrisma({
      subs: [
        {
          userId: 'u1',
          user: { id: 'u1', name: 'Ana', whatsapp: '11999999999', whatsappGroupOptIn: true },
        },
      ],
      recentLogs: [
        {
          targetUserId: 'u1',
          presetKey: 'group-invite-dm',
          status: 'sent',
          createdAt: new Date('2026-06-05T10:00:00Z'),
        },
      ],
    });
    const wa = new WhatsappService(mockConfig({ WHATSAPP_PROVIDER: 'mock' }));
    const svc = new GroupInviteService(prisma, wa);
    const list = await svc.listCandidates();
    expect(list[0]!.lastInviteStatus).toBe('dm_sent');
  });
});

describe('GroupInviteService.sendInvites (mock driver)', () => {
  it('em driver mock, adiciona todos direto e loga', async () => {
    const prisma = buildPrisma({
      subs: [
        {
          userId: 'u1',
          user: { id: 'u1', name: 'Ana', whatsapp: '11999999999', whatsappGroupOptIn: true },
        },
        {
          userId: 'u2',
          user: { id: 'u2', name: 'Beto', whatsapp: '11888888888', whatsappGroupOptIn: true },
        },
      ],
    });
    const wa = new WhatsappService(mockConfig({ WHATSAPP_PROVIDER: 'mock' }));
    const svc = new GroupInviteService(prisma, wa);
    const result = await svc.sendInvites('admin', ['u1', 'u2'], undefined, true);
    expect(result.added).toBe(2);
    expect(result.dmSent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.groupInviteUrl).toContain('chat.whatsapp.com');
    // 2 logs criados, ambos preset add
    expect((prisma as never as { _createdLogs: Array<{ presetKey: string }> })._createdLogs).toHaveLength(2);
    expect(
      (prisma as never as { _createdLogs: Array<{ presetKey: string }> })._createdLogs.every(
        (l) => l.presetKey === 'group-invite-add',
      ),
    ).toBe(true);
  });

  it('com tryAddDirect=false vai direto pra DM em modo mock', async () => {
    const prisma = buildPrisma({
      subs: [
        {
          userId: 'u1',
          user: { id: 'u1', name: 'Ana', whatsapp: '11999999999', whatsappGroupOptIn: true },
        },
      ],
    });
    const wa = new WhatsappService(mockConfig({ WHATSAPP_PROVIDER: 'mock' }));
    const svc = new GroupInviteService(prisma, wa);
    const result = await svc.sendInvites('admin', ['u1'], undefined, false);
    expect(result.added).toBe(0);
    expect(result.dmSent).toBe(1);
  });

  it('skipa usuário não-elegível e segue com os demais', async () => {
    const prisma = buildPrisma({
      subs: [
        {
          userId: 'u1',
          user: { id: 'u1', name: 'Ana', whatsapp: '11999999999', whatsappGroupOptIn: true },
        },
        // u2 não consta em subs.findMany — vai cair em skipped
      ],
    });
    const wa = new WhatsappService(mockConfig({ WHATSAPP_PROVIDER: 'mock' }));
    const svc = new GroupInviteService(prisma, wa);
    const result = await svc.sendInvites('admin', ['u1', 'u2'], undefined, true);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('usa o template do admin se enviado', async () => {
    const prisma = buildPrisma({
      subs: [
        {
          userId: 'u1',
          user: { id: 'u1', name: 'Ana', whatsapp: '11999999999', whatsappGroupOptIn: true },
        },
      ],
    });
    const wa = new WhatsappService(mockConfig({ WHATSAPP_PROVIDER: 'mock' }));
    const svc = new GroupInviteService(prisma, wa);
    const customTemplate = 'Oi {nome}, link: {linkConvite}';
    await svc.sendInvites('admin', ['u1'], customTemplate, false);
    const log = (prisma as never as {
      _createdLogs: Array<{ text: string; presetKey: string }>;
    })._createdLogs[0]!;
    expect(log.text).toContain('Oi Ana');
    expect(log.text).toContain('chat.whatsapp.com');
  });
});
