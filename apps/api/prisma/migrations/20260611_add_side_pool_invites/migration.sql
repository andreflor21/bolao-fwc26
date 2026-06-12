-- Convites individuais para bolões paralelos. Qualquer membro do bolão pode
-- convidar; uma linha representa um convite pendente (aceitar vira membership e
-- remove a linha; recusar/cancelar também remove).

-- CreateTable
CREATE TABLE "side_pool_invites" (
    "id" UUID NOT NULL,
    "side_pool_id" UUID NOT NULL,
    "invitee_user_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_pool_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "side_pool_invites_invitee_user_id_idx" ON "side_pool_invites"("invitee_user_id");

-- CreateIndex
CREATE INDEX "side_pool_invites_side_pool_id_idx" ON "side_pool_invites"("side_pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "side_pool_invites_side_pool_id_invitee_user_id_key" ON "side_pool_invites"("side_pool_id", "invitee_user_id");

-- AddForeignKey
ALTER TABLE "side_pool_invites" ADD CONSTRAINT "side_pool_invites_side_pool_id_fkey" FOREIGN KEY ("side_pool_id") REFERENCES "side_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_pool_invites" ADD CONSTRAINT "side_pool_invites_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_pool_invites" ADD CONSTRAINT "side_pool_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
