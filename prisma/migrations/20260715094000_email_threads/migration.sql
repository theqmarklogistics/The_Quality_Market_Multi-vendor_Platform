-- Admin ↔ customer email threading: outbound mail is logged and replies come
-- back through the Resend inbound webhook into the same thread.

DO $$ BEGIN
    CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EmailThread" (
    "id"            TEXT NOT NULL,
    "token"         TEXT NOT NULL,
    "subject"       TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "userId"        TEXT,
    "orderId"       TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailThread_token_key" ON "EmailThread"("token");
CREATE INDEX IF NOT EXISTS "EmailThread_customerEmail_idx" ON "EmailThread"("customerEmail");
CREATE INDEX IF NOT EXISTS "EmailThread_lastMessageAt_idx" ON "EmailThread"("lastMessageAt");

CREATE TABLE IF NOT EXISTS "EmailMessage" (
    "id"                TEXT NOT NULL,
    "threadId"          TEXT NOT NULL,
    "direction"         "EmailDirection" NOT NULL,
    "fromEmail"         TEXT NOT NULL,
    "toEmail"           TEXT NOT NULL,
    "subject"           TEXT,
    "bodyText"          TEXT,
    "bodyHtml"          TEXT,
    "providerMessageId" TEXT,
    "sentById"          TEXT,
    "isRead"            BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailMessage_threadId_createdAt_idx" ON "EmailMessage"("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailMessage_providerMessageId_idx" ON "EmailMessage"("providerMessageId");

ALTER TABLE "EmailMessage"
    ADD CONSTRAINT "EmailMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
