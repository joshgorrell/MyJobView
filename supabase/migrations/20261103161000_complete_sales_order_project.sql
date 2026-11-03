-- Issue #440. Transactional project completion; caller's row-level security applies.
CREATE OR REPLACE FUNCTION public.complete_sales_order_project(p_project_id uuid, p_choice text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_order_id uuid;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_choice IS NULL OR p_choice NOT IN ('close', 'test_and_tune') THEN
    RAISE EXCEPTION 'Invalid completion choice';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or not authorized';
  END IF;
  IF p_choice = 'close' AND v_project.test_tune_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Test and Tune has already started';
  END IF;

  SELECT id INTO v_order_id FROM public.sales_orders
  WHERE id = v_project.sales_order_id FOR UPDATE;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Linked Sales Order not found or not authorized';
  END IF;

  UPDATE public.projects SET
    status = 'completed',
    substantial_completion_date = COALESCE(substantial_completion_date, CURRENT_DATE),
    test_tune_started_at = CASE WHEN p_choice = 'test_and_tune'
      THEN COALESCE(test_tune_started_at, now()) ELSE test_tune_started_at END
  WHERE id = p_project_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Project update failed'; END IF;

  UPDATE public.sales_orders SET
    status = 'complete'
  WHERE id = v_order_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sales Order update failed'; END IF;

  RETURN jsonb_build_object('project_id', p_project_id, 'choice', p_choice);
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_sales_order_project(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sales_order_project(uuid, text) TO authenticated;
