
-- Delete the orphan ghost proposal for PRO-01-25000 (status=designing, no sales_order_id)
-- The real record (status=approved, with sales_order_id) is kept.
-- The orphan shares the same proposal number but has no sales order link and is a data integrity issue.

DELETE FROM proposal_activity WHERE proposal_id = '6425d970-4ad2-48b6-b024-caa9e083818e';
DELETE FROM proposal_line_items WHERE proposal_id = '6425d970-4ad2-48b6-b024-caa9e083818e';
DELETE FROM proposals WHERE id = '6425d970-4ad2-48b6-b024-caa9e083818e';
