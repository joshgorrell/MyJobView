-- Restrict GPS route and live-location visibility to the viewer's organization.
-- Replace permissive historical manager policies rather than adding another
-- restrictive-looking OR policy that would leave cross-tenant access open.
DROP POLICY IF EXISTS "Managers can view all breadcrumbs" ON public.enhanced_gps_breadcrumbs;
DROP POLICY IF EXISTS "Techs can view own GPS breadcrumbs" ON public.gps_breadcrumbs;
DROP POLICY IF EXISTS "Admins can view all GPS breadcrumbs" ON public.gps_breadcrumbs;

CREATE POLICY "Organization-scoped enhanced GPS read"
ON public.enhanced_gps_breadcrumbs FOR SELECT TO authenticated
USING (
  technician_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles viewer
    JOIN public.profiles technician ON technician.organization_id = viewer.organization_id
    WHERE viewer.id = (select auth.uid())
      AND technician.id = enhanced_gps_breadcrumbs.technician_id
      AND viewer.organization_id IS NOT NULL
      AND viewer.role IN ('admin','owner','dispatch','manager','production_manager','service_manager','office_manager')
  )
);

CREATE POLICY "Organization-scoped basic GPS read"
ON public.gps_breadcrumbs FOR SELECT TO authenticated
USING (
  technician_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles viewer
    JOIN public.profiles technician ON technician.organization_id = viewer.organization_id
    WHERE viewer.id = (select auth.uid())
      AND technician.id = gps_breadcrumbs.technician_id
      AND viewer.organization_id IS NOT NULL
      AND viewer.role IN ('admin','owner','dispatch','manager','production_manager','service_manager','office_manager')
  )
);
