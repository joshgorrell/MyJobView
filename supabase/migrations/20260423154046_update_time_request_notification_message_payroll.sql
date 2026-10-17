/*\n  # Update time request approval notification message\n\n  ## Change\n  Updates the `notify_tech_of_time_request_outcome` trigger function so that the\n  approval notification body now says "Xh have been added to your payroll for [date]"\n  instead of "It will appear in your schedule."\n\n  This reflects the new flow where approving a request immediately creates an approved\n  time entry — no clock-in required from the employee.\n\n  Also tightens the trigger condition: since approvals now set status directly to\n  'completed' (not 'scheduled'), we fire on 'completed' instead of 'scheduled'.\n*/\n\nCREATE OR REPLACE FUNCTION notify_tech_of_time_request_outcome()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_approver_name text

\n  v_session_type  text

\n  v_hours         numeric

\n  v_title         text

\n  v_body          text

\n  v_notif_type    text

\nBEGIN\n  -- Fire when status transitions from pending_approval to completed (approved) or denied\n  IF OLD.status <> 'pending_approval' THEN\n    RETURN NEW

\n  END IF

\n  IF NEW.status NOT IN ('completed', 'denied') THEN\n    RETURN NEW

\n  END IF

\n\n  -- Resolve approver name\n  SELECT COALESCE(full_name, email, 'A manager')\n    INTO v_approver_name\n    FROM profiles\n   WHERE id = NEW.approved_by

\n\n  v_session_type := CASE NEW.session_type\n    WHEN 'shop_time'  THEN 'Shop Time'\n    WHEN 'training'   THEN 'Training Time'\n    ELSE initcap(replace(NEW.session_type, '_', ' '))\n  END

\n\n  v_hours := COALESCE(NEW.predetermined_hours, 0)

\n\n  IF NEW.status = 'completed' THEN\n    v_notif_type := 'internal_time_request_approved'

\n    v_title      := v_session_type || ' request approved'

\n    v_body       := v_approver_name || ' approved your ' || v_session_type || ' request. ' ||\n                    v_hours::text || 'h have been added to your payroll for ' ||\n                    to_char(NEW.session_date::date, 'Mon DD') || '.'

\n  ELSE\n    v_notif_type := 'internal_time_request_denied'

\n    v_title      := v_session_type || ' request declined'

\n    v_body       := v_approver_name || ' declined your ' || v_session_type || ' request.' ||\n                    CASE WHEN NEW.denial_reason IS NOT NULL AND NEW.denial_reason <> ''\n                         THEN ' Reason: ' || NEW.denial_reason\n                         ELSE ''\n                    END

\n  END IF

\n\n  INSERT INTO notifications (user_id, type, title, body, related_id, is_read)\n  VALUES (\n    NEW.assigned_to,\n    v_notif_type,\n    v_title,\n    v_body,\n    NEW.id,\n    false\n  )

\n\n  RETURN NEW

\nEND

\n$$

\n\nDROP TRIGGER IF EXISTS trigger_notify_tech_time_request_outcome ON internal_time_sessions

\nCREATE TRIGGER trigger_notify_tech_time_request_outcome\n  AFTER UPDATE ON internal_time_sessions\n  FOR EACH ROW EXECUTE FUNCTION notify_tech_of_time_request_outcome()

\n
