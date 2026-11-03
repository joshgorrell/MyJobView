-- Portal applications use the authorized agreement RPC. Catalog allocations and
-- catalog writes belong to active staff, even when customers share the tenant.
CREATE POLICY security_monitoring_catalog_staff_scope ON public.monitoring_services
 AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=monitoring_services.organization_id AND p.is_active AND p.role<>'portal'
 AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)))
 WITH CHECK (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=monitoring_services.organization_id AND p.is_active AND p.role<>'portal'
 AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)));
