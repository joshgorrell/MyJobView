-- Connectivity heartbeat is independent of GPS movement and location samples.
CREATE TABLE IF NOT EXISTS public.technician_tracking_heartbeats (
  technician_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_clock_entry_id uuid NOT NULL REFERENCES public.daily_clock_entries(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.technician_tracking_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Technicians update own heartbeat" ON public.technician_tracking_heartbeats
 FOR INSERT TO authenticated WITH CHECK (technician_id = auth.uid());
CREATE POLICY "Technicians refresh own heartbeat" ON public.technician_tracking_heartbeats
 FOR UPDATE TO authenticated USING (technician_id = auth.uid()) WITH CHECK (technician_id = auth.uid());
CREATE POLICY "Technicians view own heartbeat" ON public.technician_tracking_heartbeats
 FOR SELECT TO authenticated USING (technician_id = auth.uid());
CREATE POLICY "Dispatch views organization heartbeats" ON public.technician_tracking_heartbeats
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.profiles viewer JOIN public.profiles employee ON employee.organization_id = viewer.organization_id
 WHERE viewer.id = auth.uid() AND employee.id = technician_tracking_heartbeats.technician_id
 AND viewer.role IN ('admin','owner','dispatch','manager','production_manager','service_manager')
));
