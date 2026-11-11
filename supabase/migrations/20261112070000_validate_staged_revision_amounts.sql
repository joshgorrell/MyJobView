-- Close input validation gaps before staged corrections can become billable revisions.
-- Staging must not accept arbitrary computed totals or non-numeric amounts.
CREATE OR REPLACE FUNCTION public.validate_change_order_revision_draft_lines(p_lines jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE x jsonb;v_qty numeric;v_price numeric;v_total numeric;
BEGIN
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revision lines must be an array'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string'
    OR (x->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Invalid revision line identity';
  END IF;
  IF x ? 'new_quantity' OR x ? 'new_unit_price' OR x ? 'new_total' THEN
   IF jsonb_typeof(x->'new_quantity') NOT IN ('number','string') OR
      jsonb_typeof(x->'new_unit_price') NOT IN ('number','string') OR
      jsonb_typeof(x->'new_total') NOT IN ('number','string') THEN
     RAISE EXCEPTION 'Quantity, unit price and total must be numeric';
   END IF;
   IF (x->>'new_quantity') !~ '^[0-9]+(\\.[0-9]+)?$' OR
      (x->>'new_unit_price') !~ '^[0-9]+(\\.[0-9]+)?$' OR
      (x->>'new_total') !~ '^[0-9]+(\\.[0-9]+)?$' THEN
     RAISE EXCEPTION 'Invalid numeric revision amount';
   END IF;
   v_qty:=(x->>'new_quantity')::numeric;
   v_price:=(x->>'new_unit_price')::numeric;
   v_total:=(x->>'new_total')::numeric;
   IF v_qty<=0 OR v_price<0 OR v_qty>100000 OR v_price>100000000 OR
      v_total>100000000000 OR scale(v_price)>4 OR scale(v_total)>2 THEN
     RAISE EXCEPTION 'Revised quantity or price out of bounds';
   END IF;
   -- CO new_total can include labor and other charges, so it is NOT universally
   -- quantity * unit_price. Keep that distinction explicit for reconciliation.
  END IF;
  IF x ? 'change_amount' AND x->'change_amount' IS NOT NULL AND
    ((x->>'change_amount') !~ '^-?[0-9]+(\\.[0-9]+)?$') THEN
   RAISE EXCEPTION 'Invalid change amount';
  END IF;
 END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_change_order_revision_draft_lines(jsonb) FROM PUBLIC;
-- Enforce on direct database writes as well as authenticated save RPC.
CREATE OR REPLACE FUNCTION change_order_commit.validate_revision_draft_row()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
 PERFORM public.validate_change_order_revision_draft_lines(NEW.draft_lines);
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_validate_revision_draft_row ON change_order_commit.revision_drafts;
CREATE TRIGGER trg_validate_revision_draft_row BEFORE INSERT OR UPDATE OF draft_lines
 ON change_order_commit.revision_drafts FOR EACH ROW EXECUTE FUNCTION change_order_commit.validate_revision_draft_row();
