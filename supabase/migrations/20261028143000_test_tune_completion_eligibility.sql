-- Test & Tune starts only after a project has actually reached substantial completion.
-- Do not permanently force customer-origin or legacy project tasks into Test & Tune.
BEGIN;
CREATE OR REPLACE FUNCTION private.mark_customer_test_tune()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE completion_date date;
BEGIN
  SELECT p.substantial_completion_date INTO completion_date
  FROM public.projects p
  WHERE p.id=NEW.project_id AND p.organization_id=NEW.organization_id;
  IF completion_date IS NULL OR completion_date>CURRENT_DATE THEN
    NEW.is_test_and_tune=false;
  END IF;
  RETURN NEW;
END;
$$;
-- Repair the single known Planning project with an erroneous completion date.
-- Its open tasks have no linked punchlist requests or work-order tasks.
UPDATE public.project_tasks t SET is_test_and_tune=false
FROM public.projects p
WHERE p.id=t.project_id AND p.organization_id=t.organization_id
  AND p.status='planning' AND p.substantial_completion_date IS NULL
  AND t.is_test_and_tune
  AND NOT EXISTS (SELECT 1 FROM public.project_punchlist_requests r WHERE r.task_id=t.id)
  AND NOT EXISTS (SELECT 1 FROM public.work_order_tasks wt WHERE wt.project_task_id=t.id);
COMMIT;
