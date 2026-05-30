import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

/**
 * Fluxo completo, nível de API:
 *   cadastro → checkout (mock) → mock-confirm → 72 palpites → submit →
 *   promover admin (SQL) → lançar resultado oficial → conferir pontuação no ranking.
 *
 * Pré-requisitos: ver playwright.config.ts. Roda com STRIPE_DRIVER=mock.
 */

const API = '/api/v1';
const uniq = process.env.E2E_RUN_ID ?? `${Date.now()}`;
const email = `e2e-${uniq}@bolao.test`;
const password = 'SenhaForte!2026';

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function promoteToAdmin(userId: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL é necessário para promover o usuário a admin');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
  } finally {
    await client.end();
  }
}

test('fluxo completo: cadastro → pagamento → palpites → resultado → pontuação', async ({
  request,
}: {
  request: APIRequestContext;
}) => {
  // 1. Cadastro
  const reg = await request.post(`${API}/auth/register`, {
    data: { name: 'E2E Player', email, password },
  });
  expect(reg.ok(), `register: ${reg.status()}`).toBeTruthy();
  const { user, tokens } = await reg.json();
  const token = tokens.accessToken as string;
  expect(token).toBeTruthy();

  // 2. Checkout (driver mock gera uma sessão fake)
  const checkout = await request.post(`${API}/subscription/checkout-session`, {
    headers: auth(token),
    data: {},
  });
  expect(checkout.ok(), `checkout: ${checkout.status()}`).toBeTruthy();
  const { sessionId } = await checkout.json();
  expect(sessionId).toBeTruthy();

  // 3. Confirma o pagamento (mock-confirm) → ativa a inscrição
  const confirm = await request.post(`${API}/subscription/mock-confirm/${sessionId}`, {
    headers: auth(token),
  });
  expect(confirm.ok(), `mock-confirm: ${confirm.status()}`).toBeTruthy();

  // 4. Carrega os 72 jogos de grupo
  const matchesRes = await request.get(`${API}/matches/group-stage`, { headers: auth(token) });
  expect(matchesRes.ok()).toBeTruthy();
  const matches = (await matchesRes.json()) as Array<{ id: string }>;
  expect(matches.length).toBe(72);

  // 5. Palpites: o 1º jogo recebe um placar específico (3x1) que vamos lançar
  //    oficialmente depois → acerto EXATO. Os demais ficam 1x0.
  const targetMatchId = matches[0].id;
  const guesses = matches.map((m, i) => ({
    matchId: m.id,
    homeGoals: i === 0 ? 3 : 1,
    awayGoals: i === 0 ? 1 : 0,
  }));
  const draft = await request.put(`${API}/guesses/group-stage`, {
    headers: auth(token),
    data: { guesses },
  });
  expect(draft.ok(), `draft: ${draft.status()}`).toBeTruthy();

  // 6. Submete os palpites finais
  const submit = await request.post(`${API}/guesses/submit`, { headers: auth(token), data: {} });
  expect(submit.ok(), `submit: ${submit.status()} ${await submit.text()}`).toBeTruthy();

  // 7. Promove o usuário a admin (sem endpoint — direto no banco)
  await promoteToAdmin(user.id);

  // 8. Lança o resultado oficial do 1º jogo (3x1 = o palpite exato do jogador)
  const result = await request.put(`${API}/admin/matches/${targetMatchId}/result`, {
    headers: auth(token),
    data: { homeGoals: 3, awayGoals: 1, confirmPreview: true },
  });
  expect(result.ok(), `result: ${result.status()} ${await result.text()}`).toBeTruthy();

  // 9. O ranking geral deve refletir a pontuação do acerto exato
  const ranking = await request.get(`${API}/general-pool/ranking`, { headers: auth(token) });
  expect(ranking.ok()).toBeTruthy();
  const dto = (await ranking.json()) as {
    rows: Array<{ userId: string; points: number; exactScores: number }>;
    ownPosition: number | null;
  };
  const own = dto.rows.find((r) => r.userId === user.id);
  expect(own, 'usuário deve aparecer no ranking').toBeTruthy();
  expect(own!.points).toBeGreaterThan(0);
  expect(own!.exactScores).toBeGreaterThanOrEqual(1);
});
