-- Leads are work items in the existing Flow, not duplicate Tasks.
-- Keep one current Flow event per active Lead and respect assignment/creator visibility.
CREATE OR REPLACE FUNCTION flow_private.sync_lead_flow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_actor_name text;
BEGIN
  DELETE FROM public.flow_events
  WHERE source_table = 'leads' AND source_id = NEW.id;
  IF NEW.status IN ('closed_won', 'closed_lost')
     OR NEW.converted_at IS NOT NULL
     OR NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  v_actor := coalesce(NEW.created_by, NEW.assigned_to);
  SELECT full_name INTO v_actor_name FROM public.profiles
  WHERE id = v_actor AND organization_id = NEW.organization_id;
  INSERT INTO public.flow_events (
    organization_id, contact_id, office_id, actor_id, actor_name, customer_name,
    category, event_type, summary, details, source_table, source_id,
    required_module, is_internal, activity_recipient_user_id, created_at
  ) VALUES (
    NEW.organization_id, NEW.contact_id, NEW.office_id, v_actor,
    coalesce(v_actor_name, 'Team member'),
    coalesce(nullif(NEW.contact_name,''), nullif(NEW.company_name,''), 'Lead'),
    'sales', 'lead_assigned',
    'Lead assigned: ' || coalesce(nullif(NEW.contact_name,''), nullif(NEW.company_name,''), 'Lead'),
    nullif(NEW.opportunity_description,''),
    'leads', NEW.id, 'leads', false, NEW.assigned_to,
    coalesce(NEW.updated_at, NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_lead_flow ON public.leads;
CREATE TRIGGER sync_lead_flow
AFTER INSERT OR UPDATE OF assigned_to, status, converted_at, opportunity_description, contact_id, contact_name
ON public.leads FOR EACH ROW EXECUTE FUNCTION flow_private.sync_lead_flow();

-- Restrictive policy applies in addition to every existing permissive Flow policy.
-- It prevents org-wide Flow access from exposing assigned lead details.
CREATE POLICY flow_leads_assignee_or_creator ON public.flow_events
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  source_table <> 'leads'
  OR (
    organization_id = (SELECT public.get_user_org_id())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = flow_events.source_id
        AND l.organization_id = flow_events.organization_id
        AND l.status NOT IN ('closed_won','closed_lost')
        AND l.converted_at IS NULL
        AND (
          l.assigned_to = (SELECT auth.uid())
          OR l.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.organization_id = l.organization_id
              AND p.role IN ('admin','manager')
          )
        )
    )
  )
);

-- Include previously assigned active Leads, including those created before this fix.
INSERT INTO public.flow_events (
  organization_id, contact_id, office_id, actor_id, actor_name, customer_name,
  category, event_type, summary, details, source_table, source_id,
  required_module, is_internal, activity_recipient_user_id, created_at
)
SELECT l.organization_id, l.contact_id, l.office_id, coalesce(l.created_by,l.assigned_to),
  coalesce(p.full_name,'Team member'),
  coalesce(nullif(l.contact_name,''),nullif(l.company_name,''),'Lead'),
  'sales', 'lead_assigned',
  'Lead assigned: ' || coalesce(nullif(l.contact_name,''),nullif(l.company_name,''),'Lead'),
  nullif(l.opportunity_description,''), 'leads', l.id, 'leads', false,
  l.assigned_to, coalesce(l.updated_at,l.created_at,now())
FROM public.leads l
LEFT JOIN public.profiles p ON p.id=coalesce(l.created_by,l.assigned_to)
WHERE l.assigned_to IS NOT NULL
  AND l.status NOT IN ('closed_won','closed_lost')
  AND l.converted_at IS NULL
  AND l.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.flow_events e WHERE e.source_table='leads' AND e.source_id=l.id);
