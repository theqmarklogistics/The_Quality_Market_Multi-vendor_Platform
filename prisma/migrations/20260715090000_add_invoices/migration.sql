-- Sequential invoices, auto-issued for Bank Transfer orders at placement.
-- The sequence guarantees race-safe, gap-tolerant unique numbering even under
-- concurrent checkouts (nextval is a single atomic statement — safe with PgBouncer).

CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id"               TEXT NOT NULL,
    "invoiceNumber"    INTEGER NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "orderId"          TEXT NOT NULL,
    "subtotal"         DOUBLE PRECISION NOT NULL,
    "shippingFee"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total"            DOUBLE PRECISION NOT NULL,
    "chargeableKg"     DOUBLE PRECISION,
    "shippingTier"     TEXT,
    "snapshot"         JSONB NOT NULL DEFAULT '{}',
    "issuedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_paymentReference_key" ON "Invoice"("paymentReference");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE INDEX IF NOT EXISTS "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
