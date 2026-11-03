-- Parent-specific accessory defaults; null overrides follow the accessory catalog.
ALTER TABLE public.product_accessories
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price_override numeric,
  ADD COLUMN IF NOT EXISTS labor_hours_override numeric,
  ADD COLUMN IF NOT EXISTS labor_rate_override numeric;
ALTER TABLE public.product_accessories
  ADD CONSTRAINT product_accessories_quantity_positive CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  ADD CONSTRAINT product_accessories_price_nonnegative CHECK (unit_price_override >= 0 AND unit_price_override < 'Infinity'::numeric),
  ADD CONSTRAINT product_accessories_hours_nonnegative CHECK (labor_hours_override >= 0 AND labor_hours_override < 'Infinity'::numeric),
  ADD CONSTRAINT product_accessories_rate_nonnegative CHECK (labor_rate_override >= 0 AND labor_rate_override < 'Infinity'::numeric);
NOTIFY pgrst, 'reload schema';
