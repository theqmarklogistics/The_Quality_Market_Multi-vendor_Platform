-- Proof-of-delivery photo fallback: lets a rider confirm a delivery with a photo
-- captured at the door when the recipient cannot provide the 4-digit OTP.
ALTER TABLE "Order" ADD COLUMN "podPhotoUrl" TEXT;
