import { RankingAlertCron } from './ranking-alert.cron';

type Row = { userId: string; position: number };

function setup(opts: { prevTop10?: string[] | null; rows: Row[] }) {
  const store: Record<string, string> = {};
  if (opts.prevTop10 !== undefined && opts.prevTop10 !== null) {
    store['bolao:ranking:top10'] = JSON.stringify(opts.prevTop10);
  }
  const redis = {
    get: jest.fn(async (k: string) => store[k] ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store[k] = v;
      return 'OK';
    }),
  };
  const ranking = {
    getGeneralRanking: jest.fn(async () => ({
      rows: opts.rows.map((r) => ({
        userId: r.userId,
        position: r.position,
        name: `User ${r.userId}`,
        points: 0,
        exactScores: 0,
        isOwn: false,
      })),
      ownPosition: null,
      total: opts.rows.length,
      poolName: 'Geral',
    })),
  };
  const prisma = {
    user: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, name: `User ${id}`, email: `${id}@b.com` })),
      ),
    },
  };
  const email = { sendRankingPositionChanged: jest.fn(async () => undefined) };
  const cron = new RankingAlertCron(
    ranking as never,
    prisma as never,
    email as never,
    redis as never,
  );
  return { cron, email, redis, store };
}

describe('RankingAlertCron', () => {
  it('primeira execução grava baseline e não envia e-mail', async () => {
    const { cron, email, store } = setup({
      prevTop10: null,
      rows: [{ userId: 'a', position: 1 }],
    });
    const r = await cron.runOnce();
    expect(r.firstRun).toBe(true);
    expect(email.sendRankingPositionChanged).not.toHaveBeenCalled();
    expect(store['bolao:ranking:top10']).toBe(JSON.stringify(['a']));
  });

  it('notifica quem entrou (true) e quem saiu (false) do top 10', async () => {
    // antes: top10 = [a, b]; agora: a caiu pra 11, c entrou em 2
    const { cron, email } = setup({
      prevTop10: ['a', 'b'],
      rows: [
        { userId: 'b', position: 1 },
        { userId: 'c', position: 2 },
        { userId: 'a', position: 11 },
      ],
    });
    const r = await cron.runOnce();
    expect(r).toMatchObject({ entered: 1, left: 1, firstRun: false });
    expect(email.sendRankingPositionChanged).toHaveBeenCalledWith('c@b.com', 'User c', 2, true);
    expect(email.sendRankingPositionChanged).toHaveBeenCalledWith('a@b.com', 'User a', 11, false);
  });

  it('sem mudança no top 10 não envia e-mail', async () => {
    const { cron, email } = setup({
      prevTop10: ['a', 'b'],
      rows: [
        { userId: 'a', position: 1 },
        { userId: 'b', position: 2 },
      ],
    });
    const r = await cron.runOnce();
    expect(r).toMatchObject({ entered: 0, left: 0 });
    expect(email.sendRankingPositionChanged).not.toHaveBeenCalled();
  });
});
