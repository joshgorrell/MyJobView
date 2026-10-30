import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
export const org=id(1),other=id(2),admin=id(3),pm=id(4),office=id(5),salesperson=id(6),inactive=id(7),outsider=id(8),order=id(10),proposal=id(20),product=id(30);
export async function finalizationDb(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE SCHEMA techsafe_source;GRANT USAGE ON SCHEMA techsafe_source TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,is_active boolean,role text,full_name text);
INSERT INTO profiles VALUES('${admin}','${org}',true,'admin','Admin'),('${pm}','${org}',true,'project_manager','PM'),('${office}','${org}',true,'office_manager','Office'),('${salesperson}','${org}',true,'sales','Sales'),('${inactive}','${org}',false,'admin','Inactive'),('${outsider}','${other}',true,'admin','Other');
CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid);INSERT INTO products VALUES('${product}','${org}'),('${id(31)}','${other}');
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid,is_portal_visible boolean DEFAULT false,total numeric DEFAULT 0);
INSERT INTO proposals(id,organization_id) VALUES('${proposal}','${org}');
CREATE TABLE sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,original_contract_total numeric DEFAULT 1000,contract_total numeric DEFAULT 1000);
INSERT INTO sales_orders(id,organization_id,proposal_id) VALUES('${order}','${org}','${proposal}');
CREATE TABLE proposal_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid,product_id uuid,description text,quantity numeric,unit_price numeric,line_total numeric,is_taxable boolean,item_type text,labor_phase_id uuid,sort_order integer,organization_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),is_hidden boolean DEFAULT false,labor_hours numeric,labor_rate numeric,labor_total numeric);
CREATE TABLE change_orders(id uuid PRIMARY KEY,sales_order_id uuid,organization_id uuid,status text,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now(),rejection_reason text,approved_by uuid,approved_by_name text,approval_date timestamptz,approval_notes text,is_locked boolean DEFAULT false,requires_customer_approval boolean DEFAULT false,customer_approved boolean DEFAULT false,requires_new_proposal boolean DEFAULT false,transferred_to_proposal_id uuid,is_billable boolean DEFAULT true,change_amount numeric DEFAULT 0,tax_amount numeric DEFAULT 0,tax_calculation_status text DEFAULT 'ready');
CREATE TABLE change_order_line_items(id uuid PRIMARY KEY,change_order_id uuid REFERENCES change_orders(id) ON DELETE CASCADE,organization_id uuid,action_type text,proposal_line_item_id uuid,product_id uuid,product_description text,product_name text,new_quantity numeric,new_unit_price numeric,is_taxable boolean,item_type text,labor_phase_id uuid,sort_order integer,created_at timestamptz DEFAULT now(),labor_hours numeric,labor_rate numeric,new_labor_total numeric);
CREATE TABLE change_order_approvals(id uuid PRIMARY KEY,change_order_id uuid REFERENCES change_orders(id),organization_id uuid,approval_level integer,approver_role text,approver_id uuid,status text DEFAULT 'pending',approved_date timestamptz,notes text,required boolean DEFAULT true);
GRANT SELECT,UPDATE ON change_orders TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON change_order_approvals TO authenticated;
CREATE FUNCTION calculate_proposal_totals(p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$BEGIN
 IF current_setting('test.fail_application',true)='true' THEN RAISE EXCEPTION 'Test application failure';END IF;
 UPDATE proposals SET total=(SELECT coalesce(sum(line_total),0) FROM proposal_line_items WHERE proposal_id=p_id AND NOT is_hidden) WHERE id=p_id;END$$;
CREATE FUNCTION public.reject_change_order(p_change_order_id uuid,p_rejection_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN
UPDATE proposal_line_items pli SET is_hidden=false WHERE pli.id IN(SELECT coli.proposal_line_item_id FROM change_order_line_items coli WHERE coli.change_order_id=p_change_order_id AND coli.action_type='remove' AND coli.proposal_line_item_id IS NOT NULL);
UPDATE change_orders SET status='rejected',rejection_reason=p_rejection_reason,is_active=false,updated_at=now() WHERE id=p_change_order_id;END;$$;
-- Minimal fixtures preserve the inspected trigger semantics, including credits.
CREATE FUNCTION public.recalc_sales_order_contract_total() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN
 UPDATE sales_orders so SET contract_total=coalesce(so.original_contract_total,0)+(SELECT coalesce(sum(CASE WHEN co.change_amount<0 THEN co.change_amount-abs(coalesce(co.tax_amount,0)) ELSE abs(co.change_amount)+coalesce(co.tax_amount,0) END),0) FROM change_orders co WHERE co.sales_order_id=NEW.sales_order_id AND co.status='approved' AND co.is_billable<>false) WHERE so.id=NEW.sales_order_id;
 RETURN NEW;END$$;
CREATE TRIGGER trg_recalc_contract_total_on_co_change AFTER INSERT OR UPDATE OF sales_order_id,status,is_billable,change_amount,tax_amount ON change_orders FOR EACH ROW EXECUTE FUNCTION recalc_sales_order_contract_total();
CREATE FUNCTION public.guard_finalization_tax_check() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.tax_calculation_status='review_required' THEN RAISE EXCEPTION 'Tax review required' USING ERRCODE='23514';END IF;RETURN NEW;END$$;
CREATE TRIGGER trigger_guard_finalization_change_orders BEFORE UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION guard_finalization_tax_check();
CREATE FUNCTION public.auto_lock_change_order() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.status IN ('approved','pending_approval','rejected','completed') AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.is_locked:=true;NEW.is_active:=false;END IF;RETURN NEW;END$$;
CREATE TRIGGER trg_auto_lock_change_order BEFORE UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION auto_lock_change_order();`);
 for(const file of ['20260326163627_fix_apply_change_order_correct_columns.sql','20261030164022_techsafe_change_order_removal_provenance.sql','20261030165226_techsafe_retry_safe_change_application.sql','20261030170839_techsafe_atomic_change_finalization.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 // Match the deployed non-anonymous legacy execution grants.
 await db.exec('REVOKE ALL ON FUNCTION public.apply_change_order(uuid) FROM PUBLIC,anon;REVOKE ALL ON FUNCTION public.reject_change_order(uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.reject_change_order(uuid,text) TO authenticated;');
 return db;
}
