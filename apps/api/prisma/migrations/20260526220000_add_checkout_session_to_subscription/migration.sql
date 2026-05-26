-- AlterTable
ALTER TABLE "subscriptions"
  ADD COLUMN "stripe_checkout_session_id" TEXT,
  ADD COLUMN "checkout_session_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_checkout_session_id_key"
  ON "subscriptions"("stripe_checkout_session_id");
