/*
  # Drop Orphaned module_user_overrides Table

  ## Purpose
  The `module_user_overrides` table was the original storage for per-user module
  access overrides, but DepartmentContext.tsx has always read from
  `user_permission_overrides` instead. This means any overrides written to
  `module_user_overrides` by the old UserModuleAccess.tsx UI had zero runtime effect.

  UserModuleAccess.tsx has been updated to read and write `user_permission_overrides`,
  so this table is now fully orphaned with no reads or writes anywhere in the codebase.

  ## Changes
  - Drops `module_user_overrides` table (it has 0 rows — confirmed before this migration)
*/

DROP TABLE IF EXISTS module_user_overrides;
