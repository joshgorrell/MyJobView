-- Preserve canonical project task IDs when substantial completion begins Test & Tune.
-- Only open tasks become Test & Tune; historical completed tasks stay in project history.
-- Existing Test & Tune tasks retain their visibility and history.
-- Keep customer_description intact as historical task content; private visibility prevents portal disclosure.
BEGIN;

CREATE OR REPLACE FUNCTION private.handoff_project_punchlist_to_test_tune()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.substantial_completion_date IS NOT NULL
     AND NEW.substantial_completion_date <= CURRENT_DATE
     AND (OLD.substantial_completion_date IS NULL OR OLD.substantial_completion_date IS DISTINCT FROM NEW.substantial_completion_date) THEN
    UPDATE public.project_tasks t
       SET is_test_and_tune = true,
           visibility = 'internal'
     WHERE t.project_id = NEW.id
       AND t.organization_id = NEW.organization_id
       AND t.status = 'open'
       AND NOT t.is_test_and_tune;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.handoff_project_punchlist_to_test_tune() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS handoff_project_punchlist_to_test_tune ON public.projects;
CREATE TRIGGER handoff_project_punchlist_to_test_tune
AFTER UPDATE OF substantial_completion_date ON public.projects
FOR EACH ROW EXECUTE FUNCTION private.handoff_project_punchlist_to_test_tune();

-- Backfill previously completed projects. This intentionally does not rewrite
-- existing Test & Tune items or their public/private visibility.
UPDATE public.project_tasks t
   SET is_test_and_tune = true,
       visibility = 'internal'
  FROM public.projects p
 WHERE p.id = t.project_id
   AND p.organization_id = t.organization_id
   AND p.substantial_completion_date IS NOT NULL
   AND p.substantial_completion_date <= CURRENT_DATE
   AND t.status = 'open'
   AND NOT t.is_test_and_tune;

COMMIT;
