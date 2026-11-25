-- Migración aditiva: campo pendingCouponCode para reserva de cupón de meses gratis.
-- No backfill; la reserva se guarda como texto (reserva puede existir sin código).
ALTER TABLE "Subscription" ADD COLUMN "pendingCouponCode" TEXT;