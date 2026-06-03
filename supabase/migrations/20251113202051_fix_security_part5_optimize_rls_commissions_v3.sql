/*
  # Fix Database Security - Part 5: Optimize RLS Policies (Commissions)

  ## Changes
  - Optimized RLS policies for commission system
  - Wraps auth.uid() in subqueries for better performance
  
  ## Tables Updated
  - employee_commission_config
  - commission_records
  - commission_adjustments
  - commission_payments
  - project_commission_overrides
  - company_commission_settings
*/

-- Employee commission config
DROP POLICY IF EXISTS "Admin can manage employee commission config" ON public.employee_commission_config;
CREATE POLICY "Admin can manage employee commission config"
  ON public.employee_commission_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own commission config" ON public.employee_commission_config;
CREATE POLICY "Users can view own commission config"
  ON public.employee_commission_config FOR SELECT
  TO authenticated
  USING (employee_id = (select auth.uid()));

-- Commission records
DROP POLICY IF EXISTS "Admin can manage all commission records" ON public.commission_records;
CREATE POLICY "Admin can manage all commission records"
  ON public.commission_records FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own commission records" ON public.commission_records;
CREATE POLICY "Users can view own commission records"
  ON public.commission_records FOR SELECT
  TO authenticated
  USING (employee_id = (select auth.uid()));

-- Commission adjustments
DROP POLICY IF EXISTS "Admin can create commission adjustments" ON public.commission_adjustments;
CREATE POLICY "Admin can create commission adjustments"
  ON public.commission_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin can view commission adjustments" ON public.commission_adjustments;
CREATE POLICY "Admin can view commission adjustments"
  ON public.commission_adjustments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Commission payments
DROP POLICY IF EXISTS "Admin can manage commission payments" ON public.commission_payments;
CREATE POLICY "Admin can manage commission payments"
  ON public.commission_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own commission payments" ON public.commission_payments;
CREATE POLICY "Users can view own commission payments"
  ON public.commission_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commission_records 
      WHERE commission_records.id = commission_payments.commission_record_id 
      AND commission_records.employee_id = (select auth.uid())
    )
  );

-- Project commission overrides
DROP POLICY IF EXISTS "Admin can manage project commission overrides" ON public.project_commission_overrides;
CREATE POLICY "Admin can manage project commission overrides"
  ON public.project_commission_overrides FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Company commission settings
DROP POLICY IF EXISTS "Admin can manage company commission settings" ON public.company_commission_settings;
CREATE POLICY "Admin can manage company commission settings"
  ON public.company_commission_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );