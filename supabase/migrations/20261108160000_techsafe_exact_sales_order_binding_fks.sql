-- Bind every private Techsafe connection to the actual approved MJV Sales Order.
-- sales_orders.proposal_id is the internal source of its approved equipment rows.
-- No standalone proposal may be used as a connection source.
CREATE UNIQUE INDEX IF NOT EXISTS techsafe_sales_order_binding_key
 ON public.sales_orders(id, organization_id, proposal_id);

ALTER TABLE techsafe_source.integration_connections
 ADD CONSTRAINT techsafe_connection_approved_sales_order_fk
 FOREIGN KEY (sales_order_id, organization_id, proposal_id)
 REFERENCES public.sales_orders(id, organization_id, proposal_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Prevent a revision from silently referring to another order, tenant or
-- approved proposal under a valid connection ID.
ALTER TABLE techsafe_source.order_revision_ledger
 ADD CONSTRAINT techsafe_revision_exact_connection_binding_fk
 FOREIGN KEY (connection_id, organization_id, sales_order_id, proposal_id)
 REFERENCES techsafe_source.integration_connections
   (connection_id, organization_id, sales_order_id, proposal_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT;

-- No grants, sender activation, checkout, or backfill.
