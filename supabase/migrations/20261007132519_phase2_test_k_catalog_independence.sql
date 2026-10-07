/*
# Phase 2 Test: K - Catalog snapshot independence

Edit the catalog_item_default_tasks row that item E sourced from.
Verify the proposal_task title does NOT change (it's a snapshot copy).
*/

UPDATE catalog_item_default_tasks
SET title = 'K-CHANGED-Catalog Title'
WHERE product_id = '312d801e-6343-4213-b189-0af0fcec7404'
  AND title = 'Install C4-EA5-V2';
