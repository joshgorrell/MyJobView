-- Inert delivery ledger. No claims worker, activation, scheduler or provider calls.
ALTER TABLE public.feedback_timeline_events ADD CONSTRAINT feedback_event_org_id_unique UNIQUE (organization_id,id);
CREATE TABLE public.feedback_timeline_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 event_id uuid NOT NULL,
 step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 12),
 template_key text NOT NULL CHECK (length(template_key) BETWEEN 1 AND 100),
 due_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','suppressed','claimed','sent','failed','uncertain')),
 provider_message_id text,
 reason text,
 FOREIGN KEY (organization_id,event_id) REFERENCES public.feedback_timeline_events(organization_id,id),
 UNIQUE (organization_id,event_id,step_number),
 CHECK (status <> 'sent' OR provider_message_id IS NOT NULL),
 CHECK (status NOT IN ('suppressed','failed','uncertain') OR reason IS NOT NULL)
);
ALTER TABLE public.feedback_timeline_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_timeline_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.feedback_timeline_deliveries TO authenticated,service_role;
CREATE POLICY feedback_delivery_admin_read ON public.feedback_timeline_deliveries
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.organization_id=feedback_timeline_deliveries.organization_id AND p.role IN ('admin','owner')
 ));
CREATE INDEX feedback_delivery_org_due_idx ON public.feedback_timeline_deliveries(organization_id,due_at,id);
COMMENT ON TABLE public.feedback_timeline_deliveries IS 'Inert ledger; unique event step is the durable delivery identity. No runtime write permissions until separate reviewed activation.';
