-- Resend webhook lifecycle: record the latest delivery state on OUTBOUND
-- messages (sent → delivered, plus delayed / opened / clicked / bounced /
-- complained). Nullable, so existing rows are untouched.

ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "statusAt" TIMESTAMP(3);
