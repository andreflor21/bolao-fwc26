-- DMs de convite pro grupo precisam saber quem foi o destinatário pra
-- não disparar duplicado em rajada. Adiciona target_user_id (nullable
-- porque broadcasts de grupo continuam sem destinatário individual).

ALTER TABLE "broadcast_logs"
    ADD COLUMN "target_user_id" UUID;

ALTER TABLE "broadcast_logs"
    ADD CONSTRAINT "broadcast_logs_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "broadcast_logs_target_user_id_idx" ON "broadcast_logs"("target_user_id");
