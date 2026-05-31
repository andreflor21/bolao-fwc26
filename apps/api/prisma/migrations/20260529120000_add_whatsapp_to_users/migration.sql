-- WhatsApp opcional + opt-in pro grupo do bolão
ALTER TABLE "users" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "users" ADD COLUMN "whatsapp_group_opt_in" BOOLEAN NOT NULL DEFAULT false;
