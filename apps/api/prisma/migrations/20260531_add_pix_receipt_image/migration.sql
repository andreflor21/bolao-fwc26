-- AlterTable: store the uploaded Pix receipt so admins can review it later.
ALTER TABLE "subscriptions"
  ADD COLUMN "pix_receipt_image" TEXT,
  ADD COLUMN "pix_receipt_mime" TEXT;
