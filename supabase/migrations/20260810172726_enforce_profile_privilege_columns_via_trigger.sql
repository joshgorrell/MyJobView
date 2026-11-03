-- F1 (revised): keep the admin user-management screens working by restoring the\n-- table-level UPDATE grant, and enforce privilege columns with a BEFORE UPDATE trigger\n-- so a non-admin can never change them on any row, including their own.\n\nGRANT UPDATE ON public.profiles TO authenticated

\n\nCREATE OR REPLACE FUNCTION public.caller_is_admin_profile()\nRETURNS boolean\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $$\n  SELECT EXISTS (\n    SELECT 1 FROM public.profiles p\n    WHERE p.id = auth.uid()\n      AND (p.is_global_admin = true OR p.role IN ('admin', 'manager'))\n  )

\n$$

\n\nREVOKE ALL ON FUNCTION public.caller_is_admin_profile() FROM public, anon

\nGRANT EXECUTE ON FUNCTION public.caller_is_admin_profile() TO authenticated

\n\nCREATE OR REPLACE FUNCTION public.protect_profile_privilege_columns()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $$\nBEGIN\n  -- Service role, cron jobs and SECURITY DEFINER internals have no auth.uid(): leave them alone.\n  IF auth.uid() IS NULL THEN\n    RETURN NEW

\n  END IF

\n\n  IF public.caller_is_admin_profile() THEN\n    RETURN NEW

\n  END IF

\n\n  NEW.role                        := OLD.role

\n  NEW.role_id                     := OLD.role_id

\n  NEW.is_global_admin             := OLD.is_global_admin

\n  NEW.organization_id             := OLD.organization_id

\n  NEW.is_active                   := OLD.is_active

\n  NEW.employment_type             := OLD.employment_type

\n  NEW.requires_daily_clock        := OLD.requires_daily_clock

\n  NEW.monthly_sales_target        := OLD.monthly_sales_target

\n  NEW.can_view_team_pulse         := OLD.can_view_team_pulse

\n  NEW.can_access_recur            := OLD.can_access_recur

\n  NEW.can_send_portal_invites     := OLD.can_send_portal_invites

\n  NEW.can_see_all_proposals       := OLD.can_see_all_proposals

\n  NEW.can_view_all_tasks          := OLD.can_view_all_tasks

\n  NEW.can_view_all_pipeline       := OLD.can_view_all_pipeline

\n  NEW.can_edit_contact_assignments:= OLD.can_edit_contact_assignments

\n  NEW.can_edit_products           := OLD.can_edit_products

\n  NEW.can_see_all_review_requests := OLD.can_see_all_review_requests

\n  NEW.can_edit_contacts           := OLD.can_edit_contacts

\n  NEW.can_view_prospects          := OLD.can_view_prospects

\n  NEW.can_view_executive_dashboard:= OLD.can_view_executive_dashboard

\n  NEW.can_delete_invoices         := OLD.can_delete_invoices

\n  NEW.can_create_work_orders      := OLD.can_create_work_orders

\n  NEW.can_create_proposals        := OLD.can_create_proposals

\n  NEW.can_create_purchase_orders  := OLD.can_create_purchase_orders

\n\n  RETURN NEW

\nEND

\n$$

\n\nDROP TRIGGER IF EXISTS protect_profile_privilege_columns_trg ON public.profiles

\nCREATE TRIGGER protect_profile_privilege_columns_trg\n  BEFORE UPDATE ON public.profiles\n  FOR EACH ROW\n  EXECUTE FUNCTION public.protect_profile_privilege_columns()

\n
