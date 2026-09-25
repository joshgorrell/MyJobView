-- Keep the invoice payment amount separate from the additional card charge.
-- Historical payments are left untouched because notes are not reliable fee evidence.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS card_fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_rate numeric(8,6),
  ADD COLUMN IF NOT EXISTS card_fee_label text,
  ADD COLUMN IF NOT EXISTS total_collected numeric(10,2);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_card_fee_nonnegative CHECK (card_fee_amount >= 0),
  ADD CONSTRAINT payments_card_fee_rate_nonnegative CHECK (card_fee_rate IS NULL OR card_fee_rate >= 0),
  ADD CONSTRAINT payments_total_collected_consistent CHECK (
    total_collected IS NULL OR total_collected = amount + card_fee_amount
  );

COMMENT ON COLUMN public.payments.amount IS 'Principal applied to the invoice, excluding any card fee.';
COMMENT ON COLUMN public.payments.card_fee_amount IS 'Payment-time card fee snapshot; zero means no fee recorded.';
COMMENT ON COLUMN public.payments.total_collected IS 'Actual total collected for this payment, including its card fee.';
