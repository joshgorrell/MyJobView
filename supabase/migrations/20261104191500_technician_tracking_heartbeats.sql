-- Connectivity heartbeat is independent of GPS movement and location samples.
CREATE TABLE IF NOT EXISTS public.technician_tracking_heartbeats (
  technician_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_clock_entry_id uuid NOT NULL REFERENCES public.daily_clock_entries(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.technician_tracking_heartbeats ENABLE ROW LEVEL SECURITY;
-- Only the database clock may establish connectivity recency.
CREATE OR REPLACE FUNCTION public.stamp_technician_tracking_heartbeat()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $
BEGIN
  NEW.last_seen_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$;
CREATE TRIGGER stamp_technician_tracking_heartbeat_before_write
BEFORE INSERT OR UPDATE ON public.technician_tracking_heartbeats
FOR EACH ROW EXECUTE FUNCTION public.stamp_technician_tracking_heartbeat();

CREATE POLICY "Technicians update own heartbeat" ON public.technician_tracking_heartbeats
 FOR INSERT TO authenticated WITH CHECK (technician_id = auth.uid() AND EXISTS (
 SELECT 1 FROM public.daily_clock_entries shift
 WHERE shift.id = daily_clock_entry_id AND shift.technician_id = auth.uid()
 AND shift.clock_out IS NULL
));
CREATE POLICY "Technicians refresh own heartbeat" ON public.technician_tracking_heartbeats
 FOR UPDATE TO authenticated USING (technician_id = auth.uid()) WITH CHECK (technician_id = auth.uid() AND EXISTS (
 SELECT 1 FROM public.daily_clock_entries shift
 WHERE shift.id = daily_clock_entry_id AND shift.technician_id = auth.uid()
 AND shift.clock_out IS NULL
));
CREATE POLICY "Technicians view own heartbeat" ON public.technician_tracking_heartbeats
 FOR SELECT TO authenticated USING (technician_id = auth.uid());
CREATE POLICY "Dispatch views organization heartbeats" ON public.technician_tracking_heartbeats
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.profiles viewer JOIN public.profiles employee ON employee.organization_id = viewer.organization_id
 WHERE viewer.id = auth.uid() AND employee.id = technician_tracking_heartbeats.technician_id
 AND viewer.role IN ('admin','owner','dispatch','manager','production_manager','service_manager')
));
