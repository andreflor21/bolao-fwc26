-- Knockout stage support: real bracket matches + per-fixture KO scoring.

-- Competition: manual official tie-break order (when FIFA criteria can't decide).
ALTER TABLE "competitions" ADD COLUMN "official_tiebreak" JSONB;

-- Match: link to the bracket fixture map + who advanced (for draws decided on pens).
ALTER TABLE "matches"
  ADD COLUMN "bracket_fixture_id" TEXT,
  ADD COLUMN "advances_team_code" TEXT;

-- One Match per fixture id within a competition (e.g. "R32-73").
CREATE UNIQUE INDEX "matches_competition_id_bracket_fixture_id_key"
  ON "matches" ("competition_id", "bracket_fixture_id");

-- Materialised knockout guess scores (group-stage scores live in guess_scores).
CREATE TABLE "knockout_guess_scores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "competition_id" TEXT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "team_points" INTEGER NOT NULL,
  "score_points" INTEGER NOT NULL,
  "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knockout_guess_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knockout_guess_scores_user_id_fixture_id_key"
  ON "knockout_guess_scores" ("user_id", "fixture_id");
CREATE INDEX "knockout_guess_scores_user_id_idx"
  ON "knockout_guess_scores" ("user_id");
CREATE INDEX "knockout_guess_scores_competition_id_idx"
  ON "knockout_guess_scores" ("competition_id");

ALTER TABLE "knockout_guess_scores"
  ADD CONSTRAINT "knockout_guess_scores_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
