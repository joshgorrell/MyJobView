-- Atomically reorder every line item in one proposal room.
-- SECURITY INVOKER retains proposal_line_items RLS and UPDATE permissions.
CREATE OR REPLACE FUNCTION public.reorder_proposal_room_items(p_room_id uuid, p_order uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_updated integer;
BEGIN
  IF p_order IS NULL OR array_length(p_order, 1) IS NULL THEN
    RAISE EXCEPTION 'Item order cannot be empty';
  END IF;

  SELECT count(*) INTO v_total FROM public.proposal_line_items WHERE room_id = p_room_id;
  IF v_total <> cardinality(p_order)
     OR (SELECT count(DISTINCT id) FROM unnest(p_order) AS ids(id)) <> v_total
     OR EXISTS (
       SELECT 1 FROM unnest(p_order) AS ids(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.proposal_line_items li
         WHERE li.id = ids.id AND li.room_id = p_room_id
       )
     )
  THEN
    RAISE EXCEPTION 'Item order does not match room contents';
  END IF;

  WITH new_order AS (
    SELECT id, (ordinality - 1)::integer AS position
    FROM unnest(p_order) WITH ORDINALITY AS items(id, ordinality)
  )
  UPDATE public.proposal_line_items li
  SET sort_order = new_order.position
  FROM new_order
  WHERE li.id = new_order.id AND li.room_id = p_room_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_total THEN
    RAISE EXCEPTION 'Could not update all proposal items';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_proposal_room_items(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_proposal_room_items(uuid, uuid[]) TO authenticated;
