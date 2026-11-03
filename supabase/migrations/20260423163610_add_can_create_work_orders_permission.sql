/*\n  # Add can_create_work_orders Permission\n\n  ## Summary\n  Adds a granular boolean permission column to the profiles table that controls\n  whether a user can create new work orders from the My Work Center page.\n\n  ## Changes\n  - `profiles.can_create_work_orders` (boolean, default false) — new permission flag\n\n  ## Default Access\n  - admin and manager roles are granted this permission automatically\n  - All other roles default to false and must be explicitly granted\n*/\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'can_create_work_orders'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN can_create_work_orders boolean NOT NULL DEFAULT false

\n  END IF

\nEND $$

\n\n-- Grant permission to existing admin and manager users by default\nUPDATE profiles\nSET can_create_work_orders = true\nWHERE role IN ('admin', 'manager')\n  AND can_create_work_orders = false

\n
