-- CreateEnum
CREATE TYPE "PixReceiptStatus" AS ENUM ('none', 'analyzing', 'auto_confirmed', 'manual_review', 'rejected');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "pix_receipt_notes" TEXT,
ADD COLUMN     "pix_receipt_status" "PixReceiptStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "pix_receipt_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "pix_receipt_verdict" JSONB;
