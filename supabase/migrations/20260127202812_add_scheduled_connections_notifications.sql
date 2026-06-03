/*
  # Add Scheduled Connections Notification System

  1. New Notification Types
    - `scheduled_connection_reminder` - Daily reminder for pending scheduled connections
    - `scheduled_connection_rollover` - Alert when a connection has been rolled over
    - `scheduled_connection_overdue` - Alert when multiple rollovers have occurred

  2. Triggers
    - Send notifications when occurrences are created for the day
    - Send notifications when occurrences are rolled over

  3. Email Templates
    - Daily reminder template
    - Rollover alert template
*/

-- Function to send scheduled connection notifications
CREATE OR REPLACE FUNCTION send_scheduled_connection_notifications()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_schedule_record RECORD;
  v_rollover_count INT;
BEGIN
  -- Get schedule details
  SELECT 
    sc.*,
    c.full_name as contact_name
  INTO v_schedule_record
  FROM scheduled_connections sc
  LEFT JOIN contacts c ON c.id = sc.contact_id
  WHERE sc.id = NEW.scheduled_connection_id;

  -- Determine notification type based on rollover count
  IF NEW.rollover_count = 0 THEN
    -- New occurrence - send reminder
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id,
      created_at
    )
    VALUES (
      v_schedule_record.created_by,
      'scheduled_connection_reminder',
      'Scheduled Connection Due Today',
      format('Your scheduled %s with %s is due today', 
        v_schedule_record.connection_type,
        COALESCE(v_schedule_record.contact_name, v_schedule_record.prospect_name)
      ),
      NEW.id,
      NOW()
    );
  ELSIF NEW.rollover_count = 1 THEN
    -- First rollover
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id,
      created_at
    )
    VALUES (
      v_schedule_record.created_by,
      'scheduled_connection_rollover',
      'Connection Rolled Over',
      format('Your scheduled %s with %s was not completed yesterday and has been rolled over to today',
        v_schedule_record.connection_type,
        COALESCE(v_schedule_record.contact_name, v_schedule_record.prospect_name)
      ),
      NEW.id,
      NOW()
    );
  ELSIF NEW.rollover_count >= 2 THEN
    -- Multiple rollovers - overdue
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id,
      created_at
    )
    VALUES (
      v_schedule_record.created_by,
      'scheduled_connection_overdue',
      'Connection Overdue',
      format('Your scheduled %s with %s is %s days overdue. This has been rolled over %s times.',
        v_schedule_record.connection_type,
        COALESCE(v_schedule_record.contact_name, v_schedule_record.prospect_name),
        NEW.rollover_count,
        NEW.rollover_count
      ),
      NEW.id,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on scheduled_connection_occurrences
DROP TRIGGER IF EXISTS send_scheduled_connection_notification_trigger ON scheduled_connection_occurrences;

CREATE TRIGGER send_scheduled_connection_notification_trigger
  AFTER INSERT ON scheduled_connection_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION send_scheduled_connection_notifications();

-- Add email templates for scheduled connections
INSERT INTO email_templates (template_type, subject, body, is_active, created_at, updated_at)
VALUES 
(
  'scheduled_connection_reminder',
  'Reminder: Scheduled Connection Due Today',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #1a1a1a;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Scheduled Connection Reminder</h1>
    </div>
    
    <div style="padding: 40px 30px;">
      <p style="font-size: 16px; line-height: 1.6; color: #333333; margin-bottom: 20px;">
        Hello {{user_name}},
      </p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333333; margin-bottom: 20px;">
        This is a friendly reminder that you have a scheduled connection due today:
      </p>
      
      <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Type:</strong> {{connection_type}}</p>
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Prospect:</strong> {{prospect_name}}</p>
        <p style="margin: 0; font-size: 14px; color: #666;"><strong>Notes:</strong> {{notes}}</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333333; margin-bottom: 30px;">
        Click the button below to view your pending connections:
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{app_url}}/connections/scheduled" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: #ffffff; 
                  padding: 14px 32px; 
                  text-decoration: none; 
                  border-radius: 6px; 
                  font-weight: 600;
                  display: inline-block;
                  font-size: 16px;">
          View Scheduled Connections
        </a>
      </div>
    </div>
    
    <div style="background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
      <p style="margin: 0; font-size: 14px; color: #666666;">
        This is an automated reminder from your connection management system.
      </p>
    </div>
  </div>',
  true,
  NOW(),
  NOW()
),
(
  'scheduled_connection_overdue',
  'Overdue: Scheduled Connection Needs Attention',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #1a1a1a;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Connection Overdue</h1>
    </div>
    
    <div style="padding: 40px 30px;">
      <p style="font-size: 16px; line-height: 1.6; color: #333333; margin-bottom: 20px;">
        Hello {{user_name}},
      </p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #dc2626; margin-bottom: 20px; font-weight: 600;">
        A scheduled connection is now {{rollover_count}} days overdue and needs your attention:
      </p>
      
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Type:</strong> {{connection_type}}</p>
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Prospect:</strong> {{prospect_name}}</p>
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Original Due Date:</strong> {{original_due_date}}</p>
        <p style="margin: 0; font-size: 14px; color: #666;"><strong>Notes:</strong> {{notes}}</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333333; margin-bottom: 30px;">
        Please complete this connection as soon as possible to maintain your relationship with this prospect.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{app_url}}/connections/scheduled" 
           style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); 
                  color: #ffffff; 
                  padding: 14px 32px; 
                  text-decoration: none; 
                  border-radius: 6px; 
                  font-weight: 600;
                  display: inline-block;
                  font-size: 16px;">
          Complete Connection Now
        </a>
      </div>
    </div>
    
    <div style="background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
      <p style="margin: 0; font-size: 14px; color: #666666;">
        This is an automated alert from your connection management system.
      </p>
    </div>
  </div>',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (template_type) DO UPDATE
SET 
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  updated_at = NOW();
