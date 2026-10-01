-- Make sales-rep identity explicit instead of inferring it from permissions or app role.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_sales_rep boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_sales_rep IS
  'Business designation: this user is an active salesperson and should appear in Sales Rep selectors. Independent of security role and permissions.';

CREATE INDEX IF NOT EXISTS profiles_org_sales_rep_idx
  ON public.profiles (organization_id, is_active, full_name)
  WHERE is_sales_rep = true;

-- Bootstrap Electronic Life safely without hard-coding an organization UUID.
WITH known_sales_reps(full_name) AS (
  VALUES ('josh gorrell'), ('aaron koker'), ('michael colley'),
         ('bobbi holthaus'), ('jon nester'), ('josh paul')
),
electronic_life_org AS (
  SELECT p.organization_id
  FROM public.profiles p
  JOIN known_sales_reps k ON lower(trim(p.full_name)) = k.full_name
  WHERE p.organization_id IS NOT NULL
  GROUP BY p.organization_id
  HAVING count(DISTINCT lower(trim(p.full_name))) >= 4
),
target_reps AS (
  SELECT p.id
  FROM public.profiles p
  JOIN electronic_life_org o ON o.organization_id = p.organization_id
  JOIN known_sales_reps k ON lower(trim(p.full_name)) = k.full_name
)
UPDATE public.profiles p
SET is_sales_rep = true
FROM target_reps t
WHERE p.id = t.id;
