/*
  # Add Recurring Work Orders Feature

  ## Summary
  Extends the work_orders table with the same recurrence infrastructure used by appointments.

  ## New Columns on work_orders
  - `recurrence_rule` (JSONB) - Stores recurrence pattern (frequency, interval, days_of_week, day_of_month, end_date, occurrences)
  - `recurrence_parent_id` (UUID) - References the parent work order; cascade-deletes children if parent is deleted
  - `is_recurring_parent` (BOOLEAN) - Flags this row as the template/parent for the series

  ## New Functions
  - `generate_recurring_work_orders(parent_id, generate_until)` - Creates pending child instances
  - `trigger_generate_recurring_work_orders()` - Fires on INSERT to auto-generate instances
  - `update_recurring_work_order_instances()` - Fires on UPDATE to keep future pending instances in sync

  ## Triggers
  - `on_recurring_work_order_created` AFTER INSERT
  - `on_recurring_work_order_parent_updated` AFTER UPDATE

  ## Indexes
  - `idx_work_orders_recurrence_parent` on recurrence_parent_id (partial, not null)
  - `idx_work_orders_is_recurring_parent` on is_recurring_parent (partial, true only)

  ## Security
  No new tables — inherits all existing RLS from work_orders.
*/

-- Add recurrence columns to work_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN recurrence_rule JSONB DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'recurrence_parent_id'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN recurrence_parent_id UUID REFERENCES work_orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'is_recurring_parent'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN is_recurring_parent BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_recurrence_parent
  ON work_orders(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_is_recurring_parent
  ON work_orders(is_recurring_parent)
  WHERE is_recurring_parent = true;

-- Function: generate child work order instances from a parent
CREATE OR REPLACE FUNCTION generate_recurring_work_orders(
  parent_work_order_id UUID,
  generate_until DATE DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  parent_wo   RECORD;
  rule        JSONB;
  frequency   TEXT;
  interval_val INTEGER;
  end_date    DATE;
  max_occurrences INTEGER;
  next_date   DATE;
  instance_count INTEGER := 0;
  new_date    DATE;
  days_of_week INTEGER[];
  day_of_month INTEGER;
BEGIN
  SELECT * INTO parent_wo
  FROM work_orders
  WHERE id = parent_work_order_id
    AND is_recurring_parent = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent work order not found or not marked as recurring';
  END IF;

  rule         := parent_wo.recurrence_rule;
  frequency    := rule->>'frequency';
  interval_val := COALESCE((rule->>'interval')::INTEGER, 1);

  -- Determine end date
  IF rule->>'end_date' IS NOT NULL THEN
    end_date := (rule->>'end_date')::DATE;
  ELSIF generate_until IS NOT NULL THEN
    end_date := generate_until;
  ELSE
    end_date := parent_wo.start_date + INTERVAL '1 year';
  END IF;

  max_occurrences := (rule->>'occurrences')::INTEGER;

  -- First instance date is one interval after the parent
  next_date := parent_wo.start_date +
    CASE frequency
      WHEN 'daily'   THEN (interval_val || ' days')::INTERVAL
      WHEN 'weekly'  THEN (interval_val || ' weeks')::INTERVAL
      WHEN 'monthly' THEN (interval_val || ' months')::INTERVAL
      WHEN 'yearly'  THEN (interval_val || ' years')::INTERVAL
    END;

  IF frequency = 'weekly' AND rule->'days_of_week' IS NOT NULL THEN
    SELECT ARRAY_AGG((value::TEXT)::INTEGER)
    INTO days_of_week
    FROM jsonb_array_elements(rule->'days_of_week');
  END IF;

  IF frequency = 'monthly' THEN
    day_of_month := COALESCE(
      (rule->>'day_of_month')::INTEGER,
      EXTRACT(DAY FROM parent_wo.start_date)::INTEGER
    );
  END IF;

  WHILE next_date <= end_date LOOP
    IF max_occurrences IS NOT NULL AND instance_count >= max_occurrences THEN
      EXIT;
    END IF;

    IF frequency = 'weekly' AND days_of_week IS NOT NULL THEN
      IF EXTRACT(DOW FROM next_date)::INTEGER = ANY(days_of_week) THEN
        new_date := next_date;
      ELSE
        next_date := next_date + (interval_val || ' weeks')::INTERVAL;
        CONTINUE;
      END IF;
    ELSIF frequency = 'monthly' THEN
      new_date := DATE_TRUNC('month', next_date) + (day_of_month - 1 || ' days')::INTERVAL;
      IF new_date > end_date THEN EXIT; END IF;
    ELSE
      new_date := next_date;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM work_orders
      WHERE recurrence_parent_id = parent_work_order_id
        AND start_date = new_date
    ) THEN
      INSERT INTO work_orders (
        company_id,
        organization_id,
        contact_id,
        project_id,
        labor_phase_id,
        labor_category_id,
        title,
        description,
        type,
        is_billable,
        billable_type,
        priority,
        status,
        assigned_to,
        start_date,
        start_time,
        end_time,
        target_completion_date,
        estimated_hours,
        notes,
        internal_notes,
        office_id,
        recurrence_parent_id,
        is_recurring_parent
      ) VALUES (
        parent_wo.company_id,
        parent_wo.organization_id,
        parent_wo.contact_id,
        parent_wo.project_id,
        parent_wo.labor_phase_id,
        parent_wo.labor_category_id,
        parent_wo.title,
        parent_wo.description,
        parent_wo.type,
        parent_wo.is_billable,
        parent_wo.billable_type,
        parent_wo.priority,
        'pending',
        parent_wo.assigned_to,
        new_date,
        parent_wo.start_time,
        parent_wo.end_time,
        NULL, -- target_completion_date computed fresh per instance
        parent_wo.estimated_hours,
        parent_wo.notes,
        parent_wo.internal_notes,
        parent_wo.office_id,
        parent_work_order_id,
        false
      );

      instance_count := instance_count + 1;
    END IF;

    next_date := next_date +
      CASE frequency
        WHEN 'daily'   THEN (interval_val || ' days')::INTERVAL
        WHEN 'weekly'  THEN (interval_val || ' weeks')::INTERVAL
        WHEN 'monthly' THEN (interval_val || ' months')::INTERVAL
        WHEN 'yearly'  THEN (interval_val || ' years')::INTERVAL
      END;
  END LOOP;

  RETURN instance_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function: auto-generate on INSERT of a recurring parent
CREATE OR REPLACE FUNCTION trigger_generate_recurring_work_orders()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring_parent = true AND NEW.recurrence_rule IS NOT NULL AND NEW.start_date IS NOT NULL THEN
    PERFORM generate_recurring_work_orders(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_recurring_work_order_created ON work_orders;
CREATE TRIGGER on_recurring_work_order_created
  AFTER INSERT ON work_orders
  FOR EACH ROW
  WHEN (NEW.is_recurring_parent = true)
  EXECUTE FUNCTION trigger_generate_recurring_work_orders();

-- Trigger function: cascade updates to future pending instances when parent changes
CREATE OR REPLACE FUNCTION update_recurring_work_order_instances()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE work_orders
  SET
    title            = NEW.title,
    description      = NEW.description,
    start_time       = NEW.start_time,
    end_time         = NEW.end_time,
    assigned_to      = NEW.assigned_to,
    priority         = NEW.priority,
    estimated_hours  = NEW.estimated_hours,
    notes            = NEW.notes,
    internal_notes   = NEW.internal_notes
  WHERE recurrence_parent_id = NEW.id
    AND start_date >= CURRENT_DATE
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_recurring_work_order_parent_updated ON work_orders;
CREATE TRIGGER on_recurring_work_order_parent_updated
  AFTER UPDATE ON work_orders
  FOR EACH ROW
  WHEN (NEW.is_recurring_parent = true)
  EXECUTE FUNCTION update_recurring_work_order_instances();
