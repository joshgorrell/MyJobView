-- Techsafe must not add a business restriction to native Sales Order deletion.
-- Keep remote provenance after permitted deletion; never cascade independent
-- remote coverage, credentials, receipts, or the integration revision stream.
CREATE TABLE techsafe_source.deleted_sales_orders (
 sales_order_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 proposal_id uuid NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE techsafe_source.deleted_sales_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.deleted_sales_orders FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE techsafe_source.deleted_sales_orders IS
 'Private native-deletion tombstones for retained remote provenance and negative delivery. No customer/equipment payload or public API.';

CREATE FUNCTION techsafe_source.capture_connected_order_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM techsafe_source.integration_connections
   WHERE sales_order_id=OLD.id AND organization_id=OLD.organization_id AND proposal_id=OLD.proposal_id) THEN
  INSERT INTO techsafe_source.deleted_sales_orders(sales_order_id,organization_id,proposal_id)
  VALUES(OLD.id,OLD.organization_id,OLD.proposal_id);
 END IF;
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.capture_connected_order_deletion() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_capture_connected_order_deletion BEFORE DELETE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION techsafe_source.capture_connected_order_deletion();

-- Replace the two order FKs with live-scope validation, so connection identity
-- survives deletion without accepting new orphaned or cross-organization links.
CREATE FUNCTION techsafe_source.validate_connection_order_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.sales_order_id IS NOT DISTINCT FROM OLD.sales_order_id
   AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
   AND NEW.proposal_id IS NOT DISTINCT FROM OLD.proposal_id THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM techsafe_source.deleted_sales_orders WHERE sales_order_id=NEW.sales_order_id) THEN
  RAISE EXCEPTION 'Deleted Sales Order cannot be connected' USING ERRCODE='23503';
 END IF;
 PERFORM 1 FROM public.sales_orders WHERE id=NEW.sales_order_id
  AND organization_id=NEW.organization_id AND proposal_id=NEW.proposal_id FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Techsafe connection requires exact native Sales Order scope' USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.validate_connection_order_scope() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_validate_connection_order_scope
BEFORE INSERT OR UPDATE OF sales_order_id,organization_id,proposal_id ON techsafe_source.integration_connections
FOR EACH ROW EXECUTE FUNCTION techsafe_source.validate_connection_order_scope();

CREATE FUNCTION techsafe_source.preserve_connected_order_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM techsafe_source.deleted_sales_orders WHERE sales_order_id=NEW.id) THEN
  RAISE EXCEPTION 'Deleted integration Sales Order identity cannot be reused' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id)
   AND EXISTS(SELECT 1 FROM techsafe_source.integration_connections WHERE sales_order_id=OLD.id) THEN
  RAISE EXCEPTION 'Connected Sales Order identity cannot be reassigned' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.preserve_connected_order_identity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_preserve_connected_order_identity
BEFORE INSERT OR UPDATE OF id,organization_id,proposal_id ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION techsafe_source.preserve_connected_order_identity();

ALTER TABLE techsafe_source.integration_connections
 DROP CONSTRAINT techsafe_connection_approved_sales_order_fk,
 DROP CONSTRAINT techsafe_connection_order_fk;

-- Native approval evidence is exclusively owned by the live order. It remains
-- immutable while that order exists, and cascades only on its actual deletion.
CREATE OR REPLACE FUNCTION techsafe_source.prevent_native_basis_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.sales_orders WHERE id=OLD.sales_order_id) THEN
  RETURN OLD;
 END IF;
 RAISE EXCEPTION 'Native approval basis is immutable';
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.prevent_native_basis_mutation() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE techsafe_source.native_approval_equipment_basis
 DROP CONSTRAINT native_approval_equipment_basis_sales_order_id_fkey,
 ADD CONSTRAINT native_approval_equipment_basis_sales_order_id_fkey
 FOREIGN KEY(sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;

-- Native invoice/procurement/deletion checks and unrelated FKs are untouched.
-- Tombstones/connection provenance have no Flow, note or attachment children.
-- HTTP delivery is performed by the existing private sender, not SQL triggers.
