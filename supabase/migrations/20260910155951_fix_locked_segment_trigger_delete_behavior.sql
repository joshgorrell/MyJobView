/* Preserve normal deletes for unlocked segments; reject locked deletes. */
CREATE OR REPLACE FUNCTION public.prevent_locked_segment_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_reopen_period_id text;
  v_reopen_authorized text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked = true THEN
      RAISE EXCEPTION 'Cannot delete locked payroll time segment %. Use the correction workflow instead.', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_locked = true THEN
    v_reopen_period_id := current_setting('app.reopen_pay_period_id', true);
    v_reopen_authorized := current_setting('app.reopen_authorized', true);

    IF current_user = 'postgres'
       AND v_reopen_authorized = 'true'
       AND v_reopen_period_id IS NOT NULL
       AND v_reopen_period_id = OLD.pay_period_id::text
       AND NEW.is_locked = false
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Cannot modify locked payroll time segment %. Use the correction workflow instead.', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;
