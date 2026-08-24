-- Re-grant SELECT on company_settings to authenticated and anon roles
-- This was lost during schema alterations, causing 403 errors on the Time Clock Management page
GRANT SELECT ON company_settings TO authenticated;
GRANT SELECT ON company_settings TO anon;
