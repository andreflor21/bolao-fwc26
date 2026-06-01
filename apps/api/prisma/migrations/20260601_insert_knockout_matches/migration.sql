-- Cria as 32 partidas do mata-mata (jogos 73–104) diretamente no banco.
-- O `prisma db seed` NÃO roda no deploy (só `migrate deploy`), então as
-- partidas KO precisam vir por migration para existirem em QA/produção.
--
-- Idempotente: ON CONFLICT no índice único (competition_id, bracket_fixture_id)
-- — criado pela migration 20260531_add_knockout_stage. Os times (home/away)
-- ficam NULL até a fase de grupos terminar; são preenchidos pelo
-- KnockoutService a partir dos resultados oficiais.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "matches"
  ("id", "competition_id", "stage", "bracket_fixture_id", "kickoff_at", "city")
VALUES
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-73',  '2026-06-28T22:00:00Z', 'Los Angeles'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-74',  '2026-06-29T20:30:00Z', 'Boston'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-75',  '2026-06-30T03:00:00Z', 'Monterrey'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-76',  '2026-06-29T18:00:00Z', 'Houston'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-77',  '2026-06-30T21:00:00Z', 'New York / New Jersey'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-78',  '2026-06-30T18:00:00Z', 'Dallas'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-79',  '2026-07-01T03:00:00Z', 'Cidade do México'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-80',  '2026-07-01T16:00:00Z', 'Atlanta'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-81',  '2026-07-02T03:00:00Z', 'San Francisco Bay Area'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-82',  '2026-07-01T23:00:00Z', 'Seattle'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-83',  '2026-07-02T23:00:00Z', 'Toronto'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-84',  '2026-07-02T22:00:00Z', 'Los Angeles'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-85',  '2026-07-03T06:00:00Z', 'Vancouver'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-86',  '2026-07-03T22:00:00Z', 'Miami'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-87',  '2026-07-04T02:30:00Z', 'Kansas City'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r32',   'R32-88',  '2026-07-03T19:00:00Z', 'Dallas'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-89',  '2026-07-04T21:00:00Z', 'Philadelphia'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-90',  '2026-07-04T18:00:00Z', 'Houston'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-91',  '2026-07-05T20:00:00Z', 'New York / New Jersey'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-92',  '2026-07-06T02:00:00Z', 'Cidade do México'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-93',  '2026-07-06T20:00:00Z', 'Dallas'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-94',  '2026-07-07T03:00:00Z', 'Seattle'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-95',  '2026-07-07T16:00:00Z', 'Atlanta'),
  (gen_random_uuid(), 'fifa-wc-2026', 'r16',   'R16-96',  '2026-07-07T23:00:00Z', 'Vancouver'),
  (gen_random_uuid(), 'fifa-wc-2026', 'qf',    'QF-97',   '2026-07-09T20:00:00Z', 'Boston'),
  (gen_random_uuid(), 'fifa-wc-2026', 'qf',    'QF-98',   '2026-07-10T22:00:00Z', 'Los Angeles'),
  (gen_random_uuid(), 'fifa-wc-2026', 'qf',    'QF-99',   '2026-07-11T21:00:00Z', 'Miami'),
  (gen_random_uuid(), 'fifa-wc-2026', 'qf',    'QF-100',  '2026-07-12T02:00:00Z', 'Kansas City'),
  (gen_random_uuid(), 'fifa-wc-2026', 'sf',    'SF-101',  '2026-07-14T20:00:00Z', 'Dallas'),
  (gen_random_uuid(), 'fifa-wc-2026', 'sf',    'SF-102',  '2026-07-15T19:00:00Z', 'Atlanta'),
  (gen_random_uuid(), 'fifa-wc-2026', 'tp',    'TP-103',  '2026-07-18T21:00:00Z', 'Miami'),
  (gen_random_uuid(), 'fifa-wc-2026', 'final', 'F-104',   '2026-07-19T19:00:00Z', 'New York / New Jersey')
ON CONFLICT ("competition_id", "bracket_fixture_id") DO NOTHING;
