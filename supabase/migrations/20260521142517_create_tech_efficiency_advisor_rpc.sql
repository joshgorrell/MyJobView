/*
  # Create Tech Efficiency Advisor RPC

  ## Purpose
  Provides a single function that returns per-technician efficiency data
  for two date windows (current and prior period) to power the AI Tech Advisor.

  ## Data Sources
  - **Payroll hours**: daily_clock_entries (what the company paid them for)
    - Filtered: status = 'clocked_out' OR payroll_hours_only = true
  - **Job hours**: time_entries (time actually logged against work orders)
    - Filtered: clock_out IS NOT NULL
  - **Salaried techs**: payroll hours = business days × 8 (no clock entries used)

  ## Returns
  One row per technician with metrics for both current and prior period,
  plus a computed trend direction.
*/

CREATE OR REPLACE FUNCTION get_tech_efficiency_for_advisor(
  p_current_start date,
  p_current_end   date,
  p_prior_start   date,
  p_prior_end     date
)
RETURNS TABLE (
  technician_id          uuid,
  technician_name        text,
  employment_type        text,
  -- Current period
  current_payroll_hours  numeric,
  current_job_hours      numeric,
  current_efficiency_pct numeric,
  current_days_worked    int,
  -- Prior period
  prior_payroll_hours    numeric,
  prior_job_hours        numeric,
  prior_efficiency_pct   numeric,
  prior_days_worked      int,
  -- Trend
  efficiency_change      numeric,
  trend_direction        text,
  -- Travel
  current_miles_driven   numeric,
  current_trips          int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_days_current int;
  v_business_days_prior   int;
BEGIN
  -- Calculate business days for salary expected hours
  SELECT COUNT(*)
  INTO v_business_days_current
  FROM generate_series(p_current_start, p_current_end, '1 day'::interval) AS d
  WHERE EXTRACT(DOW FROM d) NOT IN (0, 6);

  SELECT COUNT(*)
  INTO v_business_days_prior
  FROM generate_series(p_prior_start, p_prior_end, '1 day'::interval) AS d
  WHERE EXTRACT(DOW FROM d) NOT IN (0, 6);

  RETURN QUERY
  WITH techs AS (
    SELECT p.id, p.full_name, COALESCE(p.employment_type, 'hourly') AS emp_type
    FROM profiles p
    WHERE p.role IN ('tech', 'manager')
      AND p.full_name IS NOT NULL
  ),

  -- Current period clock hours (payroll)
  current_clock AS (
    SELECT
      d.technician_id,
      SUM(COALESCE(d.total_hours::numeric, 0)) AS payroll_hrs,
      COUNT(DISTINCT d.entry_date) AS days_clocked
    FROM daily_clock_entries d
    WHERE d.entry_date >= p_current_start
      AND d.entry_date <= p_current_end
      AND (d.status = 'clocked_out' OR d.payroll_hours_only = true)
    GROUP BY d.technician_id
  ),

  -- Prior period clock hours (payroll)
  prior_clock AS (
    SELECT
      d.technician_id,
      SUM(COALESCE(d.total_hours::numeric, 0)) AS payroll_hrs,
      COUNT(DISTINCT d.entry_date) AS days_clocked
    FROM daily_clock_entries d
    WHERE d.entry_date >= p_prior_start
      AND d.entry_date <= p_prior_end
      AND (d.status = 'clocked_out' OR d.payroll_hours_only = true)
    GROUP BY d.technician_id
  ),

  -- Current period job hours (production time)
  current_jobs AS (
    SELECT
      te.technician_id,
      SUM(COALESCE(te.total_hours::numeric, 0)) AS job_hrs,
      COUNT(DISTINCT te.entry_date) AS days_with_jobs
    FROM time_entries te
    WHERE te.entry_date >= p_current_start
      AND te.entry_date <= p_current_end
      AND te.clock_out IS NOT NULL
    GROUP BY te.technician_id
  ),

  -- Prior period job hours (production time)
  prior_jobs AS (
    SELECT
      te.technician_id,
      SUM(COALESCE(te.total_hours::numeric, 0)) AS job_hrs,
      COUNT(DISTINCT te.entry_date) AS days_with_jobs
    FROM time_entries te
    WHERE te.entry_date >= p_prior_start
      AND te.entry_date <= p_prior_end
      AND te.clock_out IS NOT NULL
    GROUP BY te.technician_id
  ),

  -- Current period travel
  current_travel AS (
    SELECT
      tbr.technician_id,
      SUM(COALESCE(tbr.total_distance_miles::numeric, 0)) AS miles,
      COUNT(*) AS trips
    FROM travel_bonus_requests tbr
    WHERE tbr.created_at >= p_current_start
      AND tbr.created_at < p_current_end + interval '1 day'
    GROUP BY tbr.technician_id
  ),

  combined AS (
    SELECT
      t.id                                                       AS tech_id,
      t.full_name                                                AS tech_name,
      t.emp_type,

      -- Current payroll hours (salary uses expected hours)
      CASE
        WHEN t.emp_type IN ('salary', 'salary_no_clock')
          THEN (v_business_days_current * 8)::numeric
        ELSE COALESCE(cc.payroll_hrs, 0)
      END AS c_payroll,

      COALESCE(cj.job_hrs, 0)                                    AS c_job,

      CASE
        WHEN t.emp_type IN ('salary', 'salary_no_clock')
          THEN GREATEST(COALESCE(cj.days_with_jobs, 0), COALESCE(cc.days_clocked, 0))
        ELSE GREATEST(COALESCE(cc.days_clocked, 0),
          CASE WHEN cc.days_clocked IS NULL THEN COALESCE(cj.days_with_jobs, 0) ELSE 0 END)
      END AS c_days,

      -- Prior payroll hours
      CASE
        WHEN t.emp_type IN ('salary', 'salary_no_clock')
          THEN (v_business_days_prior * 8)::numeric
        ELSE COALESCE(pc.payroll_hrs, 0)
      END AS p_payroll,

      COALESCE(pj.job_hrs, 0)                                    AS p_job,

      CASE
        WHEN t.emp_type IN ('salary', 'salary_no_clock')
          THEN GREATEST(COALESCE(pj.days_with_jobs, 0), COALESCE(pc.days_clocked, 0))
        ELSE GREATEST(COALESCE(pc.days_clocked, 0),
          CASE WHEN pc.days_clocked IS NULL THEN COALESCE(pj.days_with_jobs, 0) ELSE 0 END)
      END AS p_days,

      COALESCE(ct.miles, 0)                                      AS c_miles,
      COALESCE(ct.trips, 0)                                      AS c_trips

    FROM techs t
    LEFT JOIN current_clock  cc ON cc.technician_id = t.id
    LEFT JOIN current_jobs   cj ON cj.technician_id = t.id
    LEFT JOIN prior_clock    pc ON pc.technician_id = t.id
    LEFT JOIN prior_jobs     pj ON pj.technician_id = t.id
    LEFT JOIN current_travel ct ON ct.technician_id = t.id
    WHERE
      -- Only return techs who have some activity in either period
      (cc.payroll_hrs IS NOT NULL OR cj.job_hrs IS NOT NULL
       OR pc.payroll_hrs IS NOT NULL OR pj.job_hrs IS NOT NULL)
  )

  SELECT
    c.tech_id,
    c.tech_name,
    c.emp_type,

    ROUND(c.c_payroll, 2)            AS current_payroll_hours,
    ROUND(c.c_job, 2)                AS current_job_hours,
    ROUND(
      CASE WHEN c.c_payroll > 0 THEN (c.c_job / c.c_payroll) * 100 ELSE 0 END,
      1
    )                                AS current_efficiency_pct,
    c.c_days                         AS current_days_worked,

    ROUND(c.p_payroll, 2)            AS prior_payroll_hours,
    ROUND(c.p_job, 2)                AS prior_job_hours,
    ROUND(
      CASE WHEN c.p_payroll > 0 THEN (c.p_job / c.p_payroll) * 100 ELSE 0 END,
      1
    )                                AS prior_efficiency_pct,
    c.p_days                         AS prior_days_worked,

    ROUND(
      CASE WHEN c.c_payroll > 0 THEN (c.c_job / c.c_payroll) * 100 ELSE 0 END
      -
      CASE WHEN c.p_payroll > 0 THEN (c.p_job / c.p_payroll) * 100 ELSE 0 END,
      1
    )                                AS efficiency_change,

    CASE
      WHEN (
        CASE WHEN c.c_payroll > 0 THEN (c.c_job / c.c_payroll) * 100 ELSE 0 END
        -
        CASE WHEN c.p_payroll > 0 THEN (c.p_job / c.p_payroll) * 100 ELSE 0 END
      ) > 3  THEN 'improving'
      WHEN (
        CASE WHEN c.c_payroll > 0 THEN (c.c_job / c.c_payroll) * 100 ELSE 0 END
        -
        CASE WHEN c.p_payroll > 0 THEN (c.p_job / c.p_payroll) * 100 ELSE 0 END
      ) < -3 THEN 'declining'
      ELSE 'stable'
    END                              AS trend_direction,

    ROUND(c.c_miles, 1)              AS current_miles_driven,
    c.c_trips                        AS current_trips

  FROM combined c
  ORDER BY
    CASE WHEN c.c_payroll > 0 THEN (c.c_job / c.c_payroll) * 100 ELSE 0 END DESC;

END;
$$;
