-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('player', 'subscriber', 'admin');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('pending_payment', 'active', 'refunded');

-- CreateEnum
CREATE TYPE "ClosureStatus" AS ENUM ('open', 'locked', 'finalized');

-- CreateEnum
CREATE TYPE "MatchStage" AS ENUM ('group', 'r32', 'r16', 'qf', 'sf', 'tp', 'final');

-- CreateEnum
CREATE TYPE "PrizeCategory" AS ENUM ('first', 'second', 'third', 'fourth', 'fifth', 'exact_score_king', 'admin');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'player',
    "google_id" TEXT,
    "pix_key" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locks_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "closure_status" "ClosureStatus" NOT NULL DEFAULT 'open',
    "prize_pool_cents" INTEGER NOT NULL DEFAULT 0,
    "prize_distribution" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "competition_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_letter" TEXT,
    "seeded_rank" INTEGER NOT NULL,
    "flag_url" TEXT,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "competition_id" TEXT NOT NULL,
    "stage" "MatchStage" NOT NULL,
    "group_letter" TEXT,
    "round_number" INTEGER,
    "kickoff_at" TIMESTAMP(3) NOT NULL,
    "home_team_id" UUID,
    "away_team_id" UUID,
    "home_goals_official" INTEGER,
    "away_goals_official" INTEGER,
    "result_locked_at" TIMESTAMP(3),
    "city" TEXT,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "competition_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'pending_payment',
    "amount_cents" INTEGER NOT NULL DEFAULT 5000,
    "stripe_payment_intent_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refunded_amount_cents" INTEGER,
    "stripe_refund_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "side_pools" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "competition_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_members" INTEGER NOT NULL DEFAULT 100,
    "invite_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "side_pool_members" (
    "id" UUID NOT NULL,
    "side_pool_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_pool_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guesses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "home_goals" INTEGER NOT NULL,
    "away_goals" INTEGER NOT NULL,
    "is_derived" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_scores" (
    "id" UUID NOT NULL,
    "guess_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "rule_applied" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "official_result_hash" TEXT NOT NULL,

    CONSTRAINT "guess_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bracket_predictions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "competition_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bracket_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_payouts" (
    "id" UUID NOT NULL,
    "competition_id" TEXT NOT NULL,
    "user_id" UUID,
    "category" "PrizeCategory" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "paid_at" TIMESTAMP(3),
    "paid_by_admin_id" UUID,
    "payment_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prize_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "teams_group_letter_idx" ON "teams"("group_letter");

-- CreateIndex
CREATE UNIQUE INDEX "teams_competition_id_code_key" ON "teams"("competition_id", "code");

-- CreateIndex
CREATE INDEX "matches_competition_id_stage_idx" ON "matches"("competition_id", "stage");

-- CreateIndex
CREATE INDEX "matches_kickoff_at_idx" ON "matches"("kickoff_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_payment_intent_id_key" ON "subscriptions"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_competition_id_key" ON "subscriptions"("user_id", "competition_id");

-- CreateIndex
CREATE UNIQUE INDEX "side_pools_invite_token_key" ON "side_pools"("invite_token");

-- CreateIndex
CREATE INDEX "side_pools_owner_user_id_idx" ON "side_pools"("owner_user_id");

-- CreateIndex
CREATE INDEX "side_pools_competition_id_idx" ON "side_pools"("competition_id");

-- CreateIndex
CREATE INDEX "side_pool_members_user_id_idx" ON "side_pool_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "side_pool_members_side_pool_id_user_id_key" ON "side_pool_members"("side_pool_id", "user_id");

-- CreateIndex
CREATE INDEX "guesses_user_id_idx" ON "guesses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "guesses_user_id_match_id_key" ON "guesses"("user_id", "match_id");

-- CreateIndex
CREATE UNIQUE INDEX "guess_scores_guess_id_key" ON "guess_scores"("guess_id");

-- CreateIndex
CREATE UNIQUE INDEX "bracket_predictions_user_id_competition_id_key" ON "bracket_predictions"("user_id", "competition_id");

-- CreateIndex
CREATE INDEX "prize_payouts_competition_id_idx" ON "prize_payouts"("competition_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_pools" ADD CONSTRAINT "side_pools_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_pools" ADD CONSTRAINT "side_pools_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_pool_members" ADD CONSTRAINT "side_pool_members_side_pool_id_fkey" FOREIGN KEY ("side_pool_id") REFERENCES "side_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_pool_members" ADD CONSTRAINT "side_pool_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guess_scores" ADD CONSTRAINT "guess_scores_guess_id_fkey" FOREIGN KEY ("guess_id") REFERENCES "guesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_predictions" ADD CONSTRAINT "bracket_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_predictions" ADD CONSTRAINT "bracket_predictions_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_payouts" ADD CONSTRAINT "prize_payouts_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_payouts" ADD CONSTRAINT "prize_payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
