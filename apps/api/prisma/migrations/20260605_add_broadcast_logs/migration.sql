-- BroadcastLog: auditoria dos disparos do admin no grupo do WhatsApp.
-- Texto efetivamente enviado + preset de origem + retorno do provider.

CREATE TABLE "broadcast_logs" (
    "id" UUID NOT NULL,
    "preset_key" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_id" TEXT,
    "error_message" TEXT,
    "sent_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "broadcast_logs_created_at_idx" ON "broadcast_logs"("created_at");
CREATE INDEX "broadcast_logs_sent_by_user_id_idx" ON "broadcast_logs"("sent_by_user_id");

ALTER TABLE "broadcast_logs"
    ADD CONSTRAINT "broadcast_logs_sent_by_user_id_fkey"
    FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
