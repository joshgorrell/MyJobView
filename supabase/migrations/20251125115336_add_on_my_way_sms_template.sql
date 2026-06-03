/*
  # Add "On My Way" SMS Template to Company Settings

  1. Changes
    - Add `on_my_way_sms_template` field to company_settings
    - Add default template text
    - This allows admins to customize the SMS sent when technicians notify customers they're on the way
  
  2. Template Variables
    - {tech_name} - Technician's name
    - {customer_name} - Customer's name
    - {job_number} - Work order number
    - {eta} - Estimated arrival time (optional)
*/

-- Add on_my_way_sms_template to company_settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS on_my_way_sms_template text DEFAULT 'Hi {customer_name}, this is {tech_name} from your service provider. I''m on my way to your location for work order {job_number}. I should arrive soon. Thank you!';

-- Add a column to track if "on my way" notification has been sent for a work order
ALTER TABLE work_orders
ADD COLUMN IF NOT EXISTS on_my_way_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS on_my_way_sent_by uuid REFERENCES profiles(id);

-- Create index for querying
CREATE INDEX IF NOT EXISTS idx_work_orders_on_my_way ON work_orders(on_my_way_sent_at) WHERE on_my_way_sent_at IS NOT NULL;

COMMENT ON COLUMN company_settings.on_my_way_sms_template IS 'SMS template sent when technician notifies customer they are on the way. Variables: {tech_name}, {customer_name}, {job_number}';
COMMENT ON COLUMN work_orders.on_my_way_sent_at IS 'Timestamp when on my way notification was sent to customer';
COMMENT ON COLUMN work_orders.on_my_way_sent_by IS 'Technician who sent the on my way notification';
