import { BroadcastAIService } from './broadcast-ai.service';

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(async () => ({
          content: [{ type: 'text', text: '⚽ BRA x ARG hoje!\nVai ser fogo.' }],
        })),
      },
    })),
  };
});

function configWith(env: Record<string, string | undefined>) {
  return {
    get: jest.fn(<T = unknown>(key: string): T | undefined => env[key] as T | undefined),
  } as never;
}

describe('BroadcastAIService', () => {
  it('cai para template quando ANTHROPIC_API_KEY está ausente', async () => {
    const svc = new BroadcastAIService(configWith({}));
    const result = await svc.generate('top-guesses-today', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Argentina',
      guesses: [
        { homeGoals: 2, awayGoals: 1, count: 12 },
        { homeGoals: 1, awayGoals: 0, count: 8 },
      ],
    });
    expect(result.source).toBe('template');
    expect(result.text).toContain('Brasil');
    expect(result.text).toContain('Argentina');
    expect(result.text).toContain('2x1');
    expect(result.text).toContain('12 pessoas');
    // Lista TODOS os placares, não só o top — o segundo também aparece.
    expect(result.text).toContain('1x0');
  });

  it('template de mata-mata mostra acertos do confronto + placares cravados', async () => {
    const svc = new BroadcastAIService(configWith({}));
    const result = await svc.generate('top-guesses-knockout', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Japão',
      kickoffLabel: 'sáb., 14:00',
      confrontoCount: 16,
      guesses: [
        { homeGoals: 1, awayGoals: 0, count: 10 },
        { homeGoals: 2, awayGoals: 0, count: 5 },
        { homeGoals: 1, awayGoals: 2, count: 1 },
      ],
    });
    expect(result.source).toBe('template');
    expect(result.text).toContain('Brasil x Japão');
    expect(result.text).toContain('16 jogadores acertaram o confronto');
    expect(result.text).toContain('1 x 0 — 10 pessoas');
    expect(result.text).toContain('1 x 2 — 1 pessoa');
  });

  it('template de mata-mata avisa quando ninguém cravou o confronto', async () => {
    const svc = new BroadcastAIService(configWith({}));
    const result = await svc.generate('top-guesses-knockout', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Japão',
      confrontoCount: 0,
      guesses: [],
    });
    expect(result.text).toMatch(/Ninguém cravou/i);
  });

  it('template de "quem está cravando" lista os nomes do contexto', async () => {
    const svc = new BroadcastAIService(configWith({}));
    const result = await svc.generate('who-is-nailing', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Argentina',
      homeGoals: 2,
      awayGoals: 1,
      nailers: ['André', 'Maria'],
      count: 2,
    });
    expect(result.source).toBe('template');
    expect(result.text).toContain('André');
    expect(result.text).toContain('Maria');
    expect(result.text).toContain('2x1');
  });

  it('usa Claude quando há chave configurada e retorna text limpo', async () => {
    const svc = new BroadcastAIService(configWith({ ANTHROPIC_API_KEY: 'sk-test' }));
    const result = await svc.generate('win-draw-probabilities', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Argentina',
      homeWinPct: 60,
      drawPct: 25,
      awayWinPct: 15,
    });
    expect(result.source).toBe('claude');
    expect(result.text).not.toMatch(/^"/);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('template de probabilidades formata os 3 percentuais', async () => {
    const svc = new BroadcastAIService(configWith({}));
    const result = await svc.generate('win-draw-probabilities', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Argentina',
      homeWinPct: 60,
      drawPct: 25,
      awayWinPct: 15,
    });
    expect(result.text).toContain('60%');
    expect(result.text).toContain('25%');
    expect(result.text).toContain('15%');
  });

  it('template do recap chama atenção quando ninguém crava', async () => {
    const svc = new BroadcastAIService(configWith({}));
    const result = await svc.generate('match-result-recap', {
      homeTeamName: 'Brasil',
      awayTeamName: 'Argentina',
      homeGoalsOfficial: 2,
      awayGoalsOfficial: 1,
      exactScoreCount: 0,
    });
    expect(result.text).toMatch(/Ninguém cravou|ninguém cravou/i);
  });
});
