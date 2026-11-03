-- F1: users may update their own profile row, but not the columns that carry privilege.\n-- Replace table-wide UPDATE with column-level UPDATE on everything except privilege columns.\nDO $$\nDECLARE\n  col_list text

\nBEGIN\n  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)\n    INTO col_list\n  FROM information_schema.columns\n  WHERE table_schema = 'public'\n    AND table_name = 'profiles'\n    AND is_generated = 'NEVER'\n    AND column_name NOT IN (\n      'id', 'role', 'is_global_admin', 'organization_id', 'is_active',\n      'can_view_team_pulse', 'can_access_recur', 'can_send_portal_invites',\n      'can_see_all_proposals', 'can_view_all_tasks', 'can_view_all_pipeline',\n      'can_edit_contact_assignments', 'can_edit_products', 'can_see_all_review_requests',\n      'can_edit_contacts', 'can_view_prospects', 'can_view_executive_dashboard',\n      'can_delete_invoices', 'can_create_work_orders', 'can_create_proposals',\n      'can_create_purchase_orders',\n      'employment_type', 'requires_daily_clock', 'payroll_hours_only',\n      'monthly_sales_target', 'points', 'total_points'\n    )

\n\n  EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated'

\n  EXECUTE 'REVOKE UPDATE ON public.profiles FROM anon'

\n  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', col_list)

\nEND $$

\n
