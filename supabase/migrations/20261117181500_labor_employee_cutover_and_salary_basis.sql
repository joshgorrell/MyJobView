-- Retain each employee's historical payroll period while showing subcontractor job time from MJV.
-- Patch only the report fields; preserve the existing authorization and visibility scopes.
DO $migration$
DECLARE fn regprocedure; definition text; revised text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.get_labor_dashboard(date,date)'::regprocedure,
                            'public.get_tech_production(date,date)'::regprocedure] LOOP
    definition := pg_get_functiondef(fn);
    revised := definition;
    IF position('''employee_until''' in definition) = 0 THEN
    revised := replace(definition, '''hire_date'', e.hire_date',
      '''hire_date'', e.hire_date, ''employment_classification'', p.employment_classification, ''employee_until'', e.termination_date');
    revised := replace(revised, '''hire_date'',e.hire_date',
      '''hire_date'',e.hire_date,''employment_classification'',p.employment_classification,''employee_until'',e.termination_date');
    END IF;
    IF revised = definition AND position('''employee_until''' in definition) = 0 THEN
      RAISE EXCEPTION 'Expected roster field missing in %', fn;
    END IF;
    IF fn = 'public.get_tech_production(date,date)'::regprocedure AND position('''salaried'', r->''salaried''' in revised) = 0 THEN
      revised := replace(revised, '''user_id'', r->''user_id'', ''worked_hours'', r->''worked_hours''',
        '''user_id'', r->''user_id'', ''salaried'', r->''salaried'', ''worked_hours'', r->''worked_hours''');
      IF position('''salaried'', r->''salaried''' in revised) = 0 THEN
        RAISE EXCEPTION 'Expected payroll salary field missing';
      END IF;
    END IF;
    EXECUTE revised;
  END LOOP;
END $migration$;
