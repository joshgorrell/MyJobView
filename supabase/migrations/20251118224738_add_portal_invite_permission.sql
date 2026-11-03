/*\n  # Add Portal Invite Permission\n  \n  1. Changes\n    - Add `can_send_portal_invites` field to profiles table\n    - Admins and sales roles get this permission by default\n  \n  2. Notes\n    - Controls who can send customer portal invitations\n    - Can be toggled per user in admin settings\n*/\n\n-- Add permission field to profiles\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'can_send_portal_invites'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN can_send_portal_invites boolean DEFAULT false

\n  END IF

\nEND $$

\n\n-- Grant permission to admins and sales by default\nUPDATE profiles \nSET can_send_portal_invites = true \nWHERE role IN ('admin', 'sales', 'office_manager')

\n
