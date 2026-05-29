import { PalpitesLockedCron } from './locked.cron';

describe('PalpitesLockedCron', () => {
  function setup(opts: { alreadySent?: boolean; subs?: Array<{ userId: string; name: string; email: string }> }) {
    const store: Record<string, string> = {};
    if (opts.alreadySent) store['bolao:palpites-locked:sent'] = 'x';
    const redis = {
      get: jest.fn(async (k: string) => store[k] ?? null),
      set: jest.fn(async (k: string, v: string) => {
        store[k] = v;
        return 'OK';
      }),
    };
    const prisma = {
      subscription: {
        findMany: jest.fn(async () =>
          (opts.subs ?? []).map((s) => ({ userId: s.userId, user: { name: s.name, email: s.email } })),
        ),
      },
    };
    const email = { sendPalpitesLocked: jest.fn(async () => undefined) };
    const push = { sendToUser: jest.fn(async () => ({ delivered: 1, pruned: 0 })) };
    const cron = new PalpitesLockedCron(prisma as never, push as never, email as never, redis as never);
    return { cron, email, push, redis };
  }

  it('é no-op quando já disparado (idempotência)', async () => {
    const { cron, email } = setup({ alreadySent: true });
    const r = await cron.runOnce();
    expect(r.alreadyDispatched).toBe(true);
    expect(email.sendPalpitesLocked).not.toHaveBeenCalled();
  });

  it('envia email + push a cada subscriber ativo e grava o sentinel', async () => {
    const { cron, email, push, redis } = setup({
      subs: [
        { userId: 'u1', name: 'Ana Silva', email: 'a@b.com' },
        { userId: 'u2', name: 'Bruno', email: 'b@b.com' },
      ],
    });
    const r = await cron.runOnce();
    expect(r).toMatchObject({ sent: 2, candidates: 2, alreadyDispatched: false });
    expect(email.sendPalpitesLocked).toHaveBeenCalledTimes(2);
    expect(push.sendToUser).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalled();
  });

  it('continua mesmo se um envio falhar (best-effort)', async () => {
    const { cron, email } = setup({
      subs: [{ userId: 'u1', name: 'Ana', email: 'a@b.com' }],
    });
    email.sendPalpitesLocked.mockRejectedValueOnce(new Error('smtp down'));
    const r = await cron.runOnce();
    expect(r.alreadyDispatched).toBe(false);
    expect(r.candidates).toBe(1);
  });
});
