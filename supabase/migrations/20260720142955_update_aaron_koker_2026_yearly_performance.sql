
-- Update Aaron Koker's 2026 yearly sales performance to match the invoice summary report
UPDATE yearly_sales_performance
SET total_revenue = 320205.19, updated_at = now()
WHERE user_id = '67df38a9-8811-4504-bd00-6ed1a69b1ac4' AND year = 2026;
